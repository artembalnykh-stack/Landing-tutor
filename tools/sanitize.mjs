#!/usr/bin/env node
/**
 * sanitize.mjs — снятие метаданных с изображений без внешних зависимостей.
 *
 * Что делает:
 *   • JPEG  — вырезает APP1 (EXIF/XMP), APP12, APP13 (IPTC/Photoshop), APP11 (JUMBF), COM;
 *   • PNG   — вырезает tEXt, zTXt, iTXt, eXIf, tIME;
 *   • WebP  — вырезает чанки EXIF и XMP;
 *   • переименовывает файлы в нейтральные имена (doc-01.jpg, photo-01.jpg).
 *
 * Чего НЕ делает:
 *   • не замазывает содержимое. Плашки поверх серии/номера/адреса ставятся
 *     вручную в графическом редакторе, затем изображение уплощается (flatten).
 *   • не меняет пиксели и не перекодирует картинку — качество не страдает.
 *
 * Использование:
 *   node tools/sanitize.mjs assets/img/teacher.jpg
 *   node tools/sanitize.mjs scans/*.jpg --rename doc --out assets/img/diplomas
 *   node tools/sanitize.mjs scans/doc.jpg --in-place
 *   node tools/sanitize.mjs scans/doc.jpg --dry-run
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename, extname, resolve, relative } from "node:path";

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

// Маркеры, которые удаляем.
const JPEG_DROP = new Map([
  [0xe1, "APP1 (EXIF / XMP)"],
  [0xeb, "APP11 (JUMBF / C2PA)"],
  [0xec, "APP12 (Ducky)"],
  [0xed, "APP13 (IPTC / Photoshop)"],
  [0xfe, "COM (комментарий)"],
]);

function scanJpeg(buf) {
  const out = [buf.subarray(0, 2)]; // SOI
  const removed = [];
  let i = 2;

  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      throw new Error(`Нарушена структура JPEG: ожидался маркер 0xFF на смещении ${i}`);
    }

    let m = i + 1;
    while (buf[m] === 0xff) m++; // байты заполнения
    const marker = buf[m];

    // Конец изображения или начало сжатых данных — дальше не разбираем.
    if (marker === 0xd9 || marker === 0xda) {
      out.push(buf.subarray(i));
      break;
    }

    // Маркеры без длины.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(buf.subarray(i, m + 1));
      i = m + 1;
      continue;
    }

    if (m + 2 >= buf.length) {
      throw new Error("Файл обрывается: не удалось прочитать длину сегмента");
    }

    const len = buf.readUInt16BE(m + 1);
    if (len < 2) throw new Error(`Некорректная длина сегмента ${len}`);
    const end = m + 1 + len;
    if (end > buf.length) throw new Error("Файл обрывается внутри сегмента (вероятно, недокачан)");

    if (JPEG_DROP.has(marker)) {
      removed.push({ label: JPEG_DROP.get(marker), bytes: end - i });
    } else {
      out.push(buf.subarray(i, end));
    }
    i = end;
  }

  if (!removed.length) return { data: Buffer.from(buf), removed };
  return { data: Buffer.concat(out.map((b) => Buffer.from(b))), removed };
}

/** Размеры JPEG из SOF-сегмента (нужно для проверки пропорций портрета). */
export function jpegSize(buf) {
  let i = 2;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) return null;
    let m = i + 1;
    while (buf[m] === 0xff) m++;
    const marker = buf[m];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i = m + 1;
      continue;
    }
    const len = buf.readUInt16BE(m + 1);
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      return { height: buf.readUInt16BE(m + 4), width: buf.readUInt16BE(m + 6) };
    }
    i = m + 1 + len;
  }
  return null;
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

function scanPng(buf) {
  const out = [buf.subarray(0, 8)];
  const removed = [];
  let i = 8;

  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString("ascii", i + 4, i + 8);
    const end = i + 12 + len;

    if (end > buf.length) throw new Error("PNG обрывается: недокачан или повреждён");

    if (PNG_DROP.has(type)) {
      removed.push({ label: `PNG ${type}`, bytes: end - i });
    } else {
      out.push(buf.subarray(i, end));
    }

    i = end;
    if (type === "IEND") break;
  }

  return { data: Buffer.concat(out.map((b) => Buffer.from(b))), removed };
}

// ---------------------------------------------------------------------------
// WebP
// ---------------------------------------------------------------------------

function scanWebp(buf) {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("Не WebP");
  }

  const chunks = [];
  const removed = [];
  let i = 12;

  while (i + 8 <= buf.length) {
    const fourcc = buf.toString("ascii", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const padded = size + (size % 2);
    const end = i + 8 + padded;
    if (i + 8 + size > buf.length) throw new Error("WebP обрывается: недокачан");

    if (fourcc === "EXIF" || fourcc === "XMP ") {
      removed.push({ label: `WebP ${fourcc.trim()}`, bytes: end - i });
    } else {
      chunks.push(buf.subarray(i, Math.min(end, buf.length)));
    }
    i = end;
  }

  if (!removed.length) return { data: Buffer.from(buf), removed };

  const body = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(body.length + 4, 4);
  head.write("WEBP", 8, "ascii");
  return { data: Buffer.concat([head, body]), removed };
}

// ---------------------------------------------------------------------------
// Определение формата и общая обёртка
// ---------------------------------------------------------------------------

function detect(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return "png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function sanitizeBuffer(buf) {
  const kind = detect(buf);
  if (kind === "jpeg") return { kind, ...scanJpeg(buf), size: jpegSize(buf) };
  if (kind === "png") return { kind, ...scanPng(buf) };
  if (kind === "webp") return { kind, ...scanWebp(buf) };
  throw new Error("Неизвестный формат. Поддерживаются JPEG, PNG и WebP.");
}

/** Проверка, что из файла действительно вычищены метаданные. */
function residualMetadata(buf) {
  const kind = detect(buf);
  const found = [];
  if (kind === "jpeg") {
    let i = 2;
    while (i < buf.length - 1 && buf[i] === 0xff) {
      let m = i + 1;
      while (buf[m] === 0xff) m++;
      const marker = buf[m];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i = m + 1; continue; }
      const len = buf.readUInt16BE(m + 1);
      if (JPEG_DROP.has(marker)) found.push(JPEG_DROP.get(marker));
      i = m + 1 + len;
    }
    // EXIF может прятаться и внутри XMP-пакета — ищем сигнатуру.
    if (buf.includes("Exif\0\0")) found.push("сигнатура Exif внутри файла");
  }
  if (kind === "png") {
    let i = 8;
    while (i + 8 <= buf.length) {
      const len = buf.readUInt32BE(i);
      const type = buf.toString("ascii", i + 4, i + 8);
      if (PNG_DROP.has(type)) found.push(`PNG ${type}`);
      i += 12 + len;
      if (type === "IEND") break;
    }
  }
  if (kind === "webp") {
    if (buf.includes("EXIF")) found.push("WebP EXIF");
  }
  return found;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const files = [];
  const opts = { out: null, rename: null, inPlace: false, dryRun: false, quiet: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" || a === "-o") opts.out = argv[++i];
    else if (a === "--rename" || a === "-r") opts.rename = argv[++i];
    else if (a === "--in-place" || a === "-i") opts.inPlace = true;
    else if (a === "--dry-run" || a === "-n") opts.dryRun = true;
    else if (a === "--quiet" || a === "-q") opts.quiet = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a.startsWith("-")) throw new Error(`Неизвестный флаг: ${a}`);
    else files.push(a);
  }

  return { files, opts };
}

function usage() {
  console.log(`
sanitize.mjs — снятие метаданных с изображений

  node tools/sanitize.mjs <файлы> [опции]

Опции:
  -o, --out <dir>       куда писать результат (по умолчанию рядом с исходником)
  -r, --rename <base>   нейтральное имя: doc → doc-01.jpg, doc-02.jpg…
  -i, --in-place        перезаписать исходный файл
  -n, --dry-run         только показать, что будет удалено
  -q, --quiet           без подробного отчёта

Примеры:
  node tools/sanitize.mjs assets/img/teacher.jpg
  node tools/sanitize.mjs scans/*.jpg --rename doc --out assets/img/diplomas
`);
}

function main() {
  const { files, opts } = parseArgs(process.argv.slice(2));

  if (opts.help || !files.length) {
    usage();
    process.exit(files.length ? 0 : 1);
  }

  if (opts.inPlace && opts.out) {
    console.error("Нельзя одновременно --in-place и --out.");
    process.exit(1);
  }

  const pad = (n) => String(n).padStart(2, "0");
  let index = 0;
  let totalRemoved = 0;
  let failures = 0;

  for (const file of files) {
    const src = resolve(file);
    if (!existsSync(src)) {
      console.error(`✗ нет файла: ${file}`);
      failures++;
      continue;
    }
    if (!statSync(src).isFile()) continue;

    let buf;
    try {
      buf = readFileSync(src);
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
      failures++;
      continue;
    }

    let result;
    try {
      result = sanitizeBuffer(buf);
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
      failures++;
      continue;
    }

    const originalExt = extname(file).toLowerCase() || "." + result.kind;
    const ext = result.kind === "jpeg" ? ".jpg" : "." + result.kind;

    index++;
    const outName = opts.rename ? `${opts.rename}-${pad(index)}${ext}` : basename(file, extname(file)) + ext;
    const outDir = opts.out ? resolve(opts.out) : dirname(src);
    const outPath = opts.inPlace ? src : join(outDir, outName);

    const removedBytes = result.removed.reduce((s, r) => s + r.bytes, 0);
    totalRemoved += removedBytes;

    if (!opts.quiet) {
      console.log(`\n${relative(process.cwd(), src)}`);
      console.log(`  формат: ${result.kind}${result.size ? `, ${result.size.width} × ${result.size.height}` : ""}`);
      if (result.removed.length) {
        for (const r of result.removed) console.log(`  − ${r.label}: ${r.bytes} байт`);
      } else {
        console.log(`  метаданных не найдено`);
      }
      console.log(`  → ${opts.inPlace ? "перезапись" : relative(process.cwd(), outPath)}${opts.dryRun ? " (dry-run)" : ""}`);
    }

    if (opts.dryRun) continue;

    if (!opts.inPlace) mkdirSync(outDir, { recursive: true });
    writeFileSync(outPath, result.data);

    const left = residualMetadata(result.data);
    if (left.length) {
      console.error(`  ⚠ остались метаданные: ${left.join(", ")}`);
      failures++;
    }
  }

  if (!opts.quiet) {
    console.log(
      `\nГотово. Файлов: ${index}. Удалено метаданных: ${totalRemoved} байт.${failures ? ` Ошибок: ${failures}.` : ""}`
    );
    console.log(
      "Напоминание: скрипт не замазывает текст на сканах. Плашки ставятся вручную, изображение уплощается."
    );
  }

  process.exit(failures ? 1 : 0);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (invokedDirectly || process.argv[1]?.endsWith("sanitize.mjs")) {
  main();
}

export { sanitizeBuffer, residualMetadata };
