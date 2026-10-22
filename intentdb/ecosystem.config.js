// PM2 Ecosystem Config — IntentDB Gateway
// Usage: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name   : 'intentdb-gateway',
      script : 'server.js',
      cwd    : __dirname,

      // Single process — fork mode (required for cPanel Node.js)
      instances : 1,
      exec_mode : 'fork',

      // Auto-restart on crash
      autorestart  : true,
      watch        : false,
      restart_delay: 1000,
      max_restarts : 10,
      min_uptime   : '10s',

      // Memory ceiling
      max_memory_restart: '256M',

      // Logs
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file     : './logs/error.log',
      out_file       : './logs/out.log',
      merge_logs     : true,

      // Env vars come from .env (loaded by dotenv in server.js)
      env: {
        NODE_ENV: 'production',
      },

      // Graceful shutdown
      kill_timeout  : 5000,
      listen_timeout: 10000,
    },
  ],
};
