import fs from "node:fs";
import path from "node:path";

const pages = [
  "index.html",
  "ui-kit.html",
  "privacy.html",
  "concepts/index.html",
  "concepts/hero-1.html",
  "concepts/hero-2.html",
  "concepts/hero-3.html",
];

let bad = 0;

for (const p of pages) {
  if (!fs.existsSync(p)) {
    console.log("MISSING PAGE", p);
    bad++;
    continue;
  }
  const html = fs.readFileSync(p, "utf8");
  const syms = new Set([...html.matchAll(/<symbol[^>]*id="([^"]+)"/g)].map((m) => m[1]));
  const uses = [...new Set([...html.matchAll(/href="#(i-[^"]+)"/g)].map((m) => m[1]))];
  const missing = uses.filter((u) => !syms.has(u));

  const refs = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)]
    .map((m) => m[1])
    .filter((u) => !/^(https?:|mailto:|tel:|data:|#)/.test(u));
  const dir = path.dirname(p);
  const nofile = [
    ...new Set(
      refs
        .map((r) => r.split("?")[0].split("#")[0])
        .filter((f) => f && !fs.existsSync(path.join(dir, f)))
    ),
  ];

  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  const todos = (html.match(/TODO/g) || []).length;

  console.log(
    p.padEnd(24),
    "h1:" + h1,
    "sym:" + String(syms.size).padStart(2),
    "used:" + String(uses.length).padStart(2),
    "noIcon:" + (missing.length ? missing.join(",") : "-"),
    "noFile:" + (nofile.length ? nofile.join(",") : "-"),
    "TODO:" + todos
  );

  if (missing.length || nofile.length) bad++;
}

// CSS variables used but never defined
const cssFiles = fs.readdirSync("assets/css").filter((f) => f.endsWith(".css"));
const allCss = cssFiles.map((f) => fs.readFileSync(path.join("assets/css", f), "utf8")).join("\n");
const defined = new Set([...allCss.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
const usedVars = new Set([...allCss.matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
const undef = [...usedVars].filter((v) => !defined.has(v));
console.log("\nCSS vars defined:", defined.size, "used:", usedVars.size, "undefined:", undef.length ? undef.join(", ") : "-");

console.log(bad ? `\nPROBLEMS: ${bad}` : "\nALL STRUCTURAL CHECKS PASS");
