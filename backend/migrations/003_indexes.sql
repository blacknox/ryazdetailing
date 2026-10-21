-- 003 — индексы под реальные запросы админки и сайта.
CREATE INDEX IF NOT EXISTS idx_bookings_date_status ON bookings(date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(phone);
CREATE INDEX IF NOT EXISTS idx_reviews_status_created ON reviews(status, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_login ON admins(login);
