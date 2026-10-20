// scripts/build.js — сборка продакшн-копии сайта в dist/: минификация CSS и JS (исходники остаются читаемыми).
// Запуск: npm run build   →   раздавайте папку dist/ (в неё не попадают e2e, tests, scripts, node_modules).
// JS минифицируется БЕЗ переименования глобальных имён: админка вызывает функции по именам из data-click.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const SRC = path.resolve(__dirname, '..');
const OUT = path.join(SRC, 'dist');
const SKIP = new Set(['node_modules', 'dist', 'e2e', 'tests', 'scripts', '.git', 'package.json', 'package-lock.json', '.gitignore']);

fs.rmSync(OUT, { recursive: true, force: true });
let before = 0, after = 0, files = 0;
(function walk(rel) {
  for (const name of fs.readdirSync(path.join(SRC, rel))) {
    if (!rel && SKIP.has(name)) continue;
    const r = path.join(rel, name), src = path.join(SRC, r), dst = path.join(OUT, r);
    if (fs.statSync(src).isDirectory()) { walk(r); continue; }
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const ext = path.extname(name);
    if (ext === '.css' || ext === '.js') {
      const code = fs.readFileSync(src, 'utf8');
      const out = esbuild.transformSync(code, { loader: ext === '.css' ? 'css' : 'js', minify: true, target: 'es2018', legalComments: 'none', charset: 'utf8' }).code;
      fs.writeFileSync(dst, out); before += Buffer.byteLength(code); after += Buffer.byteLength(out); files++;
    } else fs.copyFileSync(src, dst);
  }
})('');
console.log(`dist/: минифицировано файлов ${files}, ${(before / 1024).toFixed(0)} КБ → ${(after / 1024).toFixed(0)} КБ (−${Math.round((1 - after / before) * 100)}%)`);
