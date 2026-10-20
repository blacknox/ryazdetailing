// e2e/run.js — E2E в Chromium на ЧИСТОЙ временной копии бэкенда (рабочая БД не затрагивается).
// Запуск:  BACKEND_DIR=../ryazdetailing-backend npm run e2e
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { startHost } = require('./host');

const SITE_DIR = path.resolve(process.env.SITE_ROOT || path.join(__dirname, '..')); // SITE_ROOT=dist — прогон на собранной копии
const BACKEND_SRC = path.resolve(process.env.BACKEND_DIR || path.join(SITE_DIR, '..', 'backend'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(path.join(BACKEND_SRC, 'server.js'))) {
    console.error(`Не найден бэкенд: ${BACKEND_SRC}. Укажите BACKEND_DIR=путь/к/бэкенду`); process.exit(2);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rd-e2e-'));
  const skip = new Set(['node_modules', 'data', 'uploads', 'backups', '.env', '.git']);
  for (const n of fs.readdirSync(BACKEND_SRC)) if (!skip.has(n)) fs.cpSync(path.join(BACKEND_SRC, n), path.join(tmp, n), { recursive: true });
  fs.symlinkSync(path.join(BACKEND_SRC, 'node_modules'), path.join(tmp, 'node_modules'), 'junction');

  const backendPort = 3800 + Math.floor(Math.random() * 100), hostPort = backendPort + 100;
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(backendPort), BACKEND_DIR: tmp,
    JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    ADMIN_LOGIN: 'admin', ADMIN_PASSWORD: 'Rz!Tester-Alpha-2026', MANAGER_LOGIN: 'mgr', MANAGER_PASSWORD: 'Rz!Tester-Beta-2026' };
  delete env.SITE_DIR;
  const backend = spawn('node', ['server.js'], { cwd: tmp, env, stdio: 'ignore' });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { ok = (await fetch(`http://127.0.0.1:${backendPort}/api/health`)).ok; } catch { await sleep(250); } }
  if (!ok) { console.error('Бэкенд не запустился'); backend.kill(); process.exit(1); }
  const host = await startHost({ siteDir: SITE_DIR, port: hostPort, backendPort });

  const specEnv = { ...process.env, BASE_URL: `http://127.0.0.1:${hostPort}`, ADMIN_PASSWORD: env.ADMIN_PASSWORD, MANAGER_PASSWORD: env.MANAGER_PASSWORD };
  const spec = process.env.E2E_SPEC || 'specs.js';
  const code = await new Promise((res) => spawn('node', [path.join(__dirname, spec)], { stdio: 'inherit', env: specEnv }).on('close', res));
  host.close(); backend.kill(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(code);
})();
