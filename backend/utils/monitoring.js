// utils/monitoring.js — отслеживание ошибок сервера.
//
// 1) Всегда: необработанные исключения и promise-ошибки попадают в журнал процесса (pm2 logs) с понятной
//    пометкой, после чего процесс завершается — pm2/systemd перезапустят его в чистом состоянии
//    (так же ведёт себя сам Node; мы лишь добавляем запись и отправку в Sentry).
// 2) Если задан SENTRY_DSN: ошибки 5xx и необработанные сбои уходят в Sentry (sentry.io или свой GlitchTip).
//
// ПЕРСОНАЛЬНЫЕ ДАННЫЕ в Sentry не отправляются: тела запросов (имена, телефоны, госномера), cookie,
// заголовки авторизации, IP и «хлебные крошки» вырезаются в beforeSend. Остаются тип ошибки, стек и адрес маршрута.
let Sentry = null;
let enabled = false;

function scrubEvent(event) {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      for (const h of Object.keys(event.request.headers)) {
        if (!/^(user-agent|content-type|accept|host)$/i.test(h)) delete event.request.headers[h];
      }
    }
  }
  delete event.user;
  delete event.breadcrumbs;
  if (event.server_name) delete event.server_name;
  return event;
}

function init() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
      sendDefaultPii: false,
      tracesSampleRate: 0,            // только ошибки, без трассировок производительности
      maxBreadcrumbs: 0,
      beforeSend: scrubEvent,
      beforeBreadcrumb: () => null,
    });
    enabled = true;
    console.log('[monitoring] Sentry включён');
  } catch (e) {
    Sentry = null;
    console.warn('[monitoring] SENTRY_DSN задан, но Sentry не запустился:', e.message);
  }
  return enabled;
}

// Подключается после всех маршрутов и ДО собственных обработчиков ошибок.
function attachExpress(app) {
  if (enabled && Sentry && Sentry.setupExpressErrorHandler) Sentry.setupExpressErrorHandler(app);
}

function capture(err) {
  if (enabled && Sentry) { try { Sentry.captureException(err); } catch { /* мониторинг не должен ронять сервер */ } }
}

async function fatal(kind, err) {
  console.error(`[fatal] ${kind}:`, err);
  capture(err);
  if (enabled && Sentry) { try { await Sentry.flush(2000); } catch { /* ignore */ } }
  process.exit(1);
}

function installProcessHandlers() {
  process.on('uncaughtException', (err) => { fatal('необработанное исключение', err); });
  process.on('unhandledRejection', (reason) => { fatal('необработанный промис', reason instanceof Error ? reason : new Error(String(reason))); });
}

module.exports = { init, attachExpress, capture, installProcessHandlers, scrubEvent };
