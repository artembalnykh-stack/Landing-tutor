#!/usr/bin/env node
/**
 * fix-encoding.mjs — восстановление текста, дважды перекодированного
 * UTF-8 → Windows-1251 → UTF-8.
 *
 * Такое случается, когда файл читают в PowerShell 5.1 без -Encoding UTF8
 * и записывают обратно как UTF-8: каждый байт кириллицы превращается в «Р»/«С».
 *
 * Признак порчи: заглавные «Р» и «С» составляют заметную долю всех кириллических
 * букв. В нормальном русском тексте они встречаются только в начале предложений
 * и имён — единицы процентов.
 *
 * Использование:
 *   node tools/fix-encoding.mjs --check .
 *   node tools/fix-encoding.mjs index.html
 *   node tools/fix-encoding.mjs index.html --dry-run
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Карта «символ → байт» для Windows-1251.
const decoder = new TextDecoder("windows-1251");
const rev = new Map();
for (let b = 0; b < 256; b++) {
  const ch = decoder.decode(Uint8Array.of(b));
  if (!rev.has(ch)) rev.set(ch, b);
}
const utf8 = new TextDecoder("utf-8", { fatal: false });

function score(text) {
  const cyr = text.match(/[\u0400-\u04FF]/g) || [];
  const rs = text.match(/[РС]/g) || [];
  return { cyrillic: cyr.length, rs: rs.length, ratio: cyr.length ? rs.length / cyr.length : 0 };
}

function repair(text) {
  const bytes = new Uint8Array(text.length);
  const unmapped = new Set();
  for (let i = 0; i < text.length; i++) {
    const code = text.codePointAt(i);
    if (code > 0xffff) {
      unmapped.add(text.slice(i, i + 2));
      bytes[i] = 0x3f;
      i++;
      continue;
    }
    const b = rev.get(text[i]);
    if (b === undefined) {
      unmapped.add(text[i]);
      bytes[i] = 0x3f;
    } else {
      bytes[i] = b;
    }
  }
  const out = utf8.decode(bytes);
  return { text: out, ok: !out.includes("\uFFFD"), unmapped: [...unmapped] };
}

const TEXT_EXT = new Set([".html", ".css", ".js", ".md", ".json", ".txt", ".mjs", ".svg"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT_EXT.has(extname(p).toLowerCase())) out.push(p);
  }
  return out;
}

const args = process.argv.slice(2);
const check = args.includes("--check");
const dryRun = args.includes("--dry-run");
const targets = args.filter((a) => !a.startsWith("-"));
if (!targets.length) targets.push(".");

const files = [];
for (const t of targets) {
  if (statSync(t).isDirectory()) files.push(...walk(t));
  else files.push(t);
}

let found = 0;

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const s = score(raw);
  if (s.cyrillic < 30 || s.ratio < 0.3) continue;

  const fixed = repair(raw);
  const a = score(fixed.text);
  const looksRight = fixed.ok && a.cyrillic > 30 && (a.rs / a.cyrillic < 0.05);

  if (!looksRight) {
    console.log(`? ${file}: маркеров ${(s.ratio * 100).toFixed(0)}%, восстановление не удалось`);
    continue;
  }

  found++;
  console.log(
    `${check ? "!" : dryRun ? "~" : "✓"} ${file}: Р/С ${(s.ratio * 100).toFixed(0)}% → ${(a.ratio * 100).toFixed(1)}%` +
      (fixed.unmapped.length ? `, символов без пары: ${fixed.unmapped.slice(0, 6).join(" ")}` : "")
  );
  if (dryRun) {
    const i = fixed.text.indexOf("<h1");
    if (i >= 0) console.log("   пример:", fixed.text.slice(i, i + 90));
  }
  if (!check && !dryRun) writeFileSync(file, fixed.text, "utf8");
}

console.log(`\n${check ? "Повреждено" : dryRun ? "Будет исправлено" : "Исправлено"}: ${found} из ${files.length}`);
if (check) process.exit(found ? 1 : 0);
