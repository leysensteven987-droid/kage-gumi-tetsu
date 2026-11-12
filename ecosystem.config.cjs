// PM2 process file for the box.
//
// Serves the built garage build-book UI + Tetsu API on one port (5274). Expose it via a
// Cloudflare Tunnel ingress:  tetsu.kage-gumi.com  ->  localhost:5274  (or reach it on
// the LAN / Tailscale at  http://kg-honbu:5274 ).
//
// Before `pm2 start ecosystem.config.cjs`, build the UI once (and after each update):
//   npm ci && npm run build
module.exports = {
  apps: [
    {
      name: "kage-gumi-tetsu",
      script: "server/index.js",
      cwd: __dirname,
      env: {
        TETSU_PORT: 5274,
      },
      autorestart: true,
    },
    {
      // Night shift: one nightly/PLAN.md item per night on the personal Claude seat, gated,
      // deployed and smoke-tested by nightly/run.mjs. PM2 fires it once on start (the runner's
      // time-window guard makes that a no-op) and then on the cron below. Pause: .nightly/PAUSED.
      name: "kage-gumi-tetsu-nightly",
      script: "nightly/run.mjs",
      cwd: __dirname,
      cron_restart: "0 2 * * *",
      autorestart: false,
      watch: false,
      time: true,
    },
  ],
};
