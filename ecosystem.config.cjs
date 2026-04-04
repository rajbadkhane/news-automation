module.exports = {
  apps: [
    {
      name: "gautam-news-bot",
      script: "index.js",
      cwd: ".",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "700M",
      kill_timeout: 10000,
      restart_delay: 5000,
      min_uptime: "20s",
      max_restarts: 20,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        TRUST_PROXY_ENABLED: "true",
        SCHEDULER_ENABLED: "true",
        AI_SCHEDULER_ENABLED: "true",
      },
    },
  ],
};
