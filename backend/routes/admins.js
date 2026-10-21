// routes/admins.js — управление учётными записями администраторов/менеджеров
// прямо из панели (раньше это делалось только через .env на сервере).
// Весь файл — только для роли 'admin': менеджер не должен видеть и тем более
// управлять чужими учётками, см. requireRole в middleware/auth.js.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { addLog } = require('../utils/logs');
const { weakPasswordReason } = require('../utils/startupChecks');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

const PUBLIC_FIELDS = 'id, login, role, active, created_at';

// GET /api/admins — список всех учётных записей (без хэшей паролей).
router.get('/', (req, res) => {
  const admins = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM admins ORDER BY id ASC`).all();
  res.json({ admins });
});

// POST /api/admins — создать нового администратора или менеджера.
router.post('/', (req, res) => {
  const { login, password, role } = req.body || {};

  if (!login || typeof login !== 'string' || login.trim().length < 3) {
    return res.status(400).json({ error: 'Логин должен быть не короче 3 символов' });
  }
  const weakNew = weakPasswordReason(password);
  if (weakNew) {
    return res.status(400).json({ error: `Пароль не подходит: ${weakNew}` });
  }
  if (role !== 'admin' && role !== 'manager') {
    return res.status(400).json({ error: 'Роль должна быть admin или manager' });
  }

  const cleanLogin = login.trim();
  const exists = db.prepare('SELECT id FROM admins WHERE login = ?').get(cleanLogin);
  if (exists) {
    return res.status(409).json({ error: 'Такой логин уже занят' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db
    .prepare('INSERT INTO admins (login, password_hash, role, active) VALUES (?, ?, ?, 1)')
    .run(cleanLogin, hash, role);

  const created = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM admins WHERE id = ?`).get(result.lastInsertRowid);
  addLog(req.admin, 'Создан администратор', created.id, `${created.login} (${created.role})`);
  res.status(201).json({ admin: created });
});

// PATCH /api/admins/:id — переключить активность, сменить роль, сбросить пароль.
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Администратор не найден' });

  const { active, role, password } = req.body || {};
  const isSelf = req.admin.id === id;

  if (active !== undefined) {
    if (isSelf && !active) {
      return res.status(400).json({ error: 'Нельзя отключить собственную учётную запись' });
    }
    if (!active) {
      const activeAdmins = db
        .prepare("SELECT COUNT(*) AS n FROM admins WHERE role = 'admin' AND active = 1")
        .get().n;
      if (target.role === 'admin' && activeAdmins <= 1) {
        return res.status(400).json({ error: 'Нельзя отключить последнего активного администратора' });
      }
    }
    db.prepare('UPDATE admins SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    addLog(req.admin, active ? 'Включён администратор' : 'Отключён администратор', id, target.login);
  }

  if (role !== undefined) {
    if (role !== 'admin' && role !== 'manager') {
      return res.status(400).json({ error: 'Роль должна быть admin или manager' });
    }
    if (isSelf && role !== 'admin') {
      return res.status(400).json({ error: 'Нельзя понизить собственную роль' });
    }
    if (target.role === 'admin' && role === 'manager') {
      const activeAdmins = db
        .prepare("SELECT COUNT(*) AS n FROM admins WHERE role = 'admin' AND active = 1")
        .get().n;
      if (activeAdmins <= 1) {
        return res.status(400).json({ error: 'Нельзя понизить последнего администратора' });
      }
    }
    db.prepare('UPDATE admins SET role = ? WHERE id = ?').run(role, id);
    addLog(req.admin, 'Изменена роль администратора', id, `${target.login} → ${role}`);
  }

  if (password !== undefined) {
    const weakReset = weakPasswordReason(password);
    if (weakReset) {
      return res.status(400).json({ error: `Новый пароль не подходит: ${weakReset}` });
    }
    const hash = bcrypt.hashSync(password, 12);
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, id);
    addLog(req.admin, 'Сброшен пароль администратора', id, target.login);
  }

  const updated = db.prepare(`SELECT ${PUBLIC_FIELDS} FROM admins WHERE id = ?`).get(id);
  res.json({ admin: updated });
});

// DELETE /api/admins/:id — удалить учётную запись совсем.
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(id);
  if (!target) return res.status(404).json({ error: 'Администратор не найден' });

  if (req.admin.id === id) {
    return res.status(400).json({ error: 'Нельзя удалить собственную учётную запись' });
  }
  if (target.role === 'admin') {
    const activeAdmins = db
      .prepare("SELECT COUNT(*) AS n FROM admins WHERE role = 'admin' AND active = 1")
      .get().n;
    if (activeAdmins <= 1) {
      return res.status(400).json({ error: 'Нельзя удалить последнего администратора' });
    }
  }

  db.prepare('DELETE FROM admins WHERE id = ?').run(id);
  addLog(req.admin, 'Удалён администратор', id, target.login);
  res.json({ ok: true });
});

module.exports = router;
