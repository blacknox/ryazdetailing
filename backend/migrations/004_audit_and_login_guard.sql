-- 004 — журнал действий хранит «что было → что стало», а вход защищён прогрессивной блокировкой.
ALTER TABLE logs ADD COLUMN changes TEXT;   -- JSON: { поле: [старое, новое] }
ALTER TABLE logs ADD COLUMN ip TEXT;        -- для событий безопасности (неудачный вход, блокировка)

CREATE TABLE IF NOT EXISTS login_failures (
  key TEXT PRIMARY KEY,                     -- 'ip:<адрес>' или 'acct:<логин>'
  fails INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,  -- unix-время в мс
  last_at INTEGER NOT NULL DEFAULT 0
);
