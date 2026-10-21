// tests/run-integration.js — запускает integration/security/images/rbac тесты, каждый на СВОЕЙ
// чистой временной копии бэкенда (рабочая БД не затрагивается). Запуск: npm run test:integration
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..');
const SUITES = ['integration.js', 'images.js', 'rbac.js', 'password.js', 'business.js', 'dast.js', 'loghygiene.js', 'security.js']; // security последним: блокирует вход с IP
const EXCLUDE = new Set(['node_modules', 'data', 'uploads', 'backups', '.env', '.git']);

function copyBackend(dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(SRC)) {
    if (EXCLUDE.has(name)) continue;
    fs.cpSync(path.join(SRC, name), path.join(dst, name), { recursive: true });
  }
  fs.symlinkSync(path.join(SRC, 'node_modules'), path.join(dst, 'node_modules'), 'junction');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitHealthy(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return true; } catch { /* ещё не поднялся */ }
    await sleep(250);
  }
  return false;
}

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('close', (code) => resolve(code));
  });
}

(async () => {
  let failed = 0;
  let port = 3990;
  for (const suite of SUITES) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-it-'));
    copyBackend(dir);
    const env = {
      ...process.env, NODE_ENV: 'test', PORT: String(++port), BACKEND_DIR: dir,
      JWT_SECRET: crypto.randomBytes(48).toString('hex'),
      ADMIN_LOGIN: 'admin', ADMIN_PASSWORD: 'Rz!Tester-Alpha-2026',
      MANAGER_LOGIN: 'mgr', MANAGER_PASSWORD: 'Rz!Tester-Beta-2026',
    };
    delete env.SITE_DIR;
    const logFile = path.join(dir, 'server.log'); const logFd = fs.openSync(logFile, 'w'); env.SERVER_LOG = logFile;
    const srv = spawn('node', ['server.js'], { cwd: dir, env, stdio: ['ignore', logFd, logFd] });
    console.log(`\n=== ${suite} (порт ${port}) ===`);
    if (!(await waitHealthy(port))) { console.error('Сервер не запустился'); failed++; srv.kill(); continue; }
    const code = await run('node', [path.join('tests', suite)], { cwd: dir, env });
    if (code !== 0) failed++;
    srv.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(failed ? `\nПровалено наборов: ${failed}` : '\nВсе integration-наборы прошли');
  process.exit(failed ? 1 : 0);
})();
