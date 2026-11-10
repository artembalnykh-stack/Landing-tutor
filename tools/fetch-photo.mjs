#!/usr/bin/env node
/**
 * fetch-photo.mjs — докачивает изображение параллельными Range-запросами.
 *
 * Зачем: прокси images.weserv.nl отдаёт примерно 25 КБ на соединение, после чего
 * поток зависает. Один последовательный запрос растягивается на минуты.
 * Несколько параллельных Range-запросов забирают файл за один проход.
 *
 * Использование:
 *   node tools/fetch-photo.mjs <url> <outfile> [chunkKB] [concurrency]
 */

import { writeFileSync, existsSync, unlinkSync } from "node:fs";

const url = process.argv[2];
const out = process.argv[3];
const chunkSize = Number(process.argv[4] || 24) * 1024;
const concurrency = Number(process.argv[5] || 5);

if (!url || !out) {
  console.error("usage: node tools/fetch-photo.mjs <url> <outfile> [chunkKB] [concurrency]");
  process.exit(1);
}

const headers = { "Accept-Encoding": "identity", "User-Agent": "Mozilla/5.0 (compatible; photo-fetch)" };

async function head() {
  // Range 0-0 даёт Content-Range с полным размером.
  const res = await fetch(url, { headers: { ...headers, Range: "bytes=0-0" }, signal: AbortSignal.timeout(60000) });
  const cr = res.headers.get("content-range");
  if (!cr) throw new Error("сервер не поддерживает Range: " + res.status);
  const total = Number(cr.split("/")[1]);
  return total;
}

/** Забирает один диапазон, при обрыве продолжает с того же места. */
async function grab(start, end, attempt = 0) {
  const want = end - start + 1;
  const parts = [];
  let got = 0;
  let cursor = start;

  while (got < want && attempt < 6) {
    attempt++;
    try {
      const res = await fetch(url, {
        headers: { ...headers, Range: `bytes=${cursor}-${end}` },
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok && res.status !== 206) throw new Error("HTTP " + res.status);

      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error("пустой ответ");

      // Не допускаем выхода за границу диапазона.
      const take = buf.subarray(0, Math.min(buf.length, want - got));
      parts.push(take);
      got += take.length;
      cursor += take.length;
    } catch (err) {
      // Обрыв после частичной выдачи — продолжаем с текущей позиции.
      if (got >= want) break;
    }
  }

  if (got < want) throw new Error(`диапазон ${start}-${end} недобран: ${got}/${want}`);
  return Buffer.concat(parts);
}

async function pool(tasks, limit) {
  const results = new Array(tasks.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (i < tasks.length) {
        const idx = i++;
        results[idx] = await tasks[idx]();
      }
    })
  );
  return results;
}

const main = async () => {
  const total = await head();
  console.log(`всего ${total} байт, чанк ${chunkSize / 1024} КБ, потоков ${concurrency}`);

  const ranges = [];
  for (let s = 0; s < total; s += chunkSize) ranges.push([s, Math.min(s + chunkSize - 1, total - 1)]);

  const t0 = Date.now();
  const chunks = await pool(
    ranges.map(([s, e], idx) => async () => {
      const buf = await grab(s, e);
      console.log(`  ✓ чанк ${idx + 1}/${ranges.length} · ${buf.length} байт`);
      return buf;
    }),
    concurrency
  );

  const data = Buffer.concat(chunks);
  if (data.length !== total) throw new Error(`итог ${data.length} ≠ ${total}`);
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error("нет JPEG SOI");
  if (data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) throw new Error("нет JPEG EOI");

  writeFileSync(out, data);
  console.log(`\n✓ ${out} — ${data.length} байт за ${((Date.now() - t0) / 1000).toFixed(1)} с`);
};

main().catch((err) => {
  console.error("✗ " + err.message);
  process.exit(1);
});
