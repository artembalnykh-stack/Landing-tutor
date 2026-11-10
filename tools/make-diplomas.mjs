/**
 * make-diplomas.mjs
 * Генерирует 6 SVG-плейсхолдеров документов для блока «Дипломы».
 *
 * Принцип: файлы создаются уже ОЧИЩЕННЫМИ — серия и номер не «закрыты слоем»,
 * а заменены сплошной заливкой. Оригиналы сканов на сервер не попадают.
 *
 * Запуск: node tools/make-diplomas.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "assets", "img", "diplomas");
mkdirSync(outDir, { recursive: true });

const C = {
  paper: "#FCF9F2",
  paperEdge: "#F4EEE2",
  ink: "#2B2A28",
  muted: "#6E6659",
  line: "#CFC4AE",
  lineSoft: "#E2D9C6",
  redact: "#2E2D2B",
  seal: "#8A3A32",
};

const W = 800;
const H = 1131;

/** Перенос строки по ширине в символах (грубая, но предсказуемая оценка). */
function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function document({ id, label, issuer, title, subtitle, lead, name, programLabel, program, extra, city, year, signer }) {
  const programLines = wrap(program, 46);
  const lineHeight = 30;

  let y = 520;
  const programSvg = programLines
    .map((line, i) => {
      const dy = y + i * lineHeight;
      return `<text x="400" y="${dy}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="21" fill="${C.ink}">${esc(line)}</text>`;
    })
    .join("\n  ");

  const programEnd = y + (programLines.length - 1) * lineHeight;
  const extraY = programEnd + 58;
  const signatureY = Math.max(extraY + 96, 930);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">
  <title>${esc(label)}</title>
  <defs>
    <linearGradient id="paper-${id}" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="${C.paper}" />
      <stop offset="1" stop-color="${C.paperEdge}" />
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#paper-${id})" />

  <!-- рамка -->
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="${C.line}" stroke-width="2" />
  <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="${C.lineSoft}" stroke-width="1" />

  <!-- угловые метки -->
  <g stroke="${C.line}" stroke-width="1.2" fill="none">
    <path d="M26 76h20M76 26v20" />
    <path d="M${W - 26} 76h-20M${W - 76} 26v20" />
    <path d="M26 ${H - 76}h20M76 ${H - 26}v-20" />
    <path d="M${W - 26} ${H - 76}h-20M${W - 76} ${H - 26}v-20" />
  </g>

  <!-- шапка -->
  <text x="400" y="112" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11" letter-spacing="2.4" fill="${C.muted}">${esc(issuer)}</text>
  <line x1="286" y1="132" x2="514" y2="132" stroke="${C.line}" stroke-width="1" />

  <!-- заголовок -->
  <text x="400" y="222" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="54" letter-spacing="9" fill="${C.ink}">${esc(title)}</text>
  <text x="400" y="262" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="19" font-style="italic" fill="${C.muted}">${esc(subtitle)}</text>

  <!-- орнамент -->
  <g stroke="${C.line}" stroke-width="1" fill="none">
    <line x1="330" y1="306" x2="372" y2="306" />
    <line x1="428" y1="306" x2="470" y2="306" />
  </g>
  <path d="M400 300l6 6-6 6-6-6z" fill="none" stroke="${C.line}" stroke-width="1" />

  <!-- выдан -->
  <text x="400" y="372" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12.5" letter-spacing="0.6" fill="${C.muted}">${esc(lead)}</text>
  <text x="400" y="424" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="33" letter-spacing="1.5" fill="${C.ink}">${esc(name)}</text>

  <!-- программа -->
  <text x="400" y="478" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="12" letter-spacing="0.4" fill="${C.muted}">${esc(programLabel)}</text>
  ${programSvg}

  ${
    extra
      ? `<text x="400" y="${extraY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="11.5" letter-spacing="1.4" fill="${C.muted}">${esc(extra)}</text>`
      : ""
  }

  <!-- нижний блок -->
  <line x1="86" y1="${signatureY - 40}" x2="${W - 86}" y2="${signatureY - 40}" stroke="${C.lineSoft}" stroke-width="1" />

  <text x="86" y="${signatureY + 12}" font-family="Arial, Helvetica, sans-serif" font-size="11" letter-spacing="0.5" fill="${C.muted}">${esc(city)} · ${esc(year)}</text>

  <!-- редактирование: серия и номер -->
  <g>
    <rect x="${W - 336}" y="${signatureY - 4}" width="250" height="26" rx="3" fill="${C.redact}" />
    <text x="${W - 211}" y="${signatureY + 35}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="9.5" letter-spacing="1" fill="${C.muted}">СЕРИЯ И НОМЕР СКРЫТЫ</text>
  </g>

  <!-- подпись -->
  <line x1="86" y1="${signatureY + 96}" x2="266" y2="${signatureY + 96}" stroke="${C.line}" stroke-width="1" />
  <text x="86" y="${signatureY + 116}" font-family="Arial, Helvetica, sans-serif" font-size="10" letter-spacing="1" fill="${C.muted}">${esc(signer)}</text>

  <!-- печать -->
  <g opacity="0.55">
    <circle cx="${W - 200}" cy="${signatureY + 76}" r="42" fill="none" stroke="${C.seal}" stroke-width="1.4" />
    <circle cx="${W - 200}" cy="${signatureY + 76}" r="34" fill="none" stroke="${C.seal}" stroke-width="0.7" />
    <text x="${W - 200}" y="${signatureY + 72}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7" letter-spacing="1.2" fill="${C.seal}">ДОКУМЕНТ</text>
    <text x="${W - 200}" y="${signatureY + 86}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="7" letter-spacing="1.2" fill="${C.seal}">ПРОВЕРЕН</text>
  </g>
</svg>
`;
}

const docs = [
  {
    id: "01",
    label: "Диплом МПГУ, 1995",
    issuer: "МИНИСТЕРСТВО ОБРАЗОВАНИЯ РОССИЙСКОЙ ФЕДЕРАЦИИ",
    title: "ДИПЛОМ",
    subtitle: "о высшем образовании",
    lead: "Настоящий диплом выдан",
    name: "ТАТЬЯНА ПАВЛОВНА",
    programLabel: "присуждена квалификация",
    program: "Учитель русского языка и литературы",
    extra: "ДИПЛОМ С ОТЛИЧИЕМ",
    city: "Москва",
    year: "1995",
    signer: "Ректор",
  },
  {
    id: "02",
    label: "Удостоверение о повышении квалификации, 2021",
    issuer: "МОСКОВСКИЙ ПЕДАГОГИЧЕСКИЙ ГОСУДАРСТВЕННЫЙ УНИВЕРСИТЕТ",
    title: "УДОСТОВЕРЕНИЕ",
    subtitle: "о повышении квалификации",
    lead: "Выдано",
    name: "ТАТЬЯНА ПАВЛОВНА",
    programLabel: "в том, что он(а) прошёл(ла) обучение по программе",
    program: "«Современные методики преподавания русского языка в школе»",
    extra: "72 ЧАСА",
    city: "Москва",
    year: "2021",
    signer: "Ректор",
  },
  {
    id: "03",
    label: "Удостоверение о повышении квалификации, 2023",
    issuer: "ИНСТИТУТ РАЗВИТИЯ ОБРАЗОВАНИЯ",
    title: "УДОСТОВЕРЕНИЕ",
    subtitle: "о повышении квалификации",
    lead: "Выдано",
    name: "ТАТЬЯНА ПАВЛОВНА",
    programLabel: "в том, что он(а) прошёл(ла) обучение по программе",
    program: "«Подготовка к ЕГЭ по русскому языку: работа с новыми форматами ФИПИ»",
    extra: "108 ЧАСОВ",
    city: "Москва",
    year: "2023",
    signer: "Директор",
  },
  {
    id: "04",
    label: "Сертификат по психологии подростка, 2024",
    issuer: "ОНЛАЙН-УНИВЕРСИТЕТ «СОВРЕМЕННАЯ ПЕДАГОГИКА»",
    title: "СЕРТИФИКАТ",
    subtitle: "подтверждает прохождение обучения",
    lead: "Выдан",
    name: "ТАТЬЯНА ПАВЛОВНА",
    programLabel: "по программе",
    program: "«Психология подростка: как удерживать мотивацию и внимание»",
    extra: "36 ЧАСОВ",
    city: "Москва",
    year: "2024",
    signer: "Куратор программы",
  },
  {
    id: "05",
    label: "Сертификат по ИИ-инструментам в работе педагога, 2025",
    issuer: "ПРОГРАММА ПРОФЕССИОНАЛЬНОГО РАЗВИТИЯ",
    title: "СЕРТИФИКАТ",
    subtitle: "подтверждает прохождение обучения",
    lead: "Выдан",
    name: "ТАТЬЯНА ПАВЛОВНА",
    programLabel: "по программе",
    program: "«ИИ-ассистенты в работе педагога: нейросети для проверки, подбора заданий и обратной связи»",
    extra: "24 ЧАСА",
    city: "Москва",
    year: "2025",
    signer: "Куратор программы",
  },
  {
    id: "06",
    label: "Удостоверение по работе с тревожностью на экзамене, 2026",
    issuer: "КУРС «ПЕДАГОГ.ОНЛАЙН»",
    title: "УДОСТОВЕРЕНИЕ",
    subtitle: "о повышении квалификации",
    lead: "Выдано",
    name: "ТАТЬЯНА ПАВЛОВНА",
    programLabel: "в том, что он(а) прошёл(ла) обучение по программе",
    program: "«Работа с тревожностью ученика на экзамене»",
    extra: "18 ЧАСОВ",
    city: "Москва",
    year: "2026",
    signer: "Руководитель курса",
  },
];

for (const doc of docs) {
  const file = join(outDir, `doc-${doc.id}.svg`);
  writeFileSync(file, document(doc), "utf8");
  console.log(`✓ ${file}`);
}

console.log(`\nГотово: ${docs.length} документа.`);
