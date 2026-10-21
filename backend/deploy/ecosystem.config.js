// pm2 start deploy/ecosystem.config.js
module.exports = {
  apps: [{
    name: 'ryazdetailing-api',
    script: 'server.js',
    cwd: __dirname + '/..',
    instances: 1,            // SQLite — один процесс, без кластера
    autorestart: true,
    max_memory_restart: '300M',
    // Логи — в папке приложения (logs/), чтобы их ротировал deploy/logrotate-ryazdetailing; с отметкой времени.
    out_file: __dirname + '/../logs/api-out.log',
    error_file: __dirname + '/../logs/api-error.log',
    merge_logs: true,
    time: true,
    env: { NODE_ENV: 'production' }
  }]
};
