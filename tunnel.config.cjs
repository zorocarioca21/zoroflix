module.exports = {
  apps: [
    {
      name: "cloudflare-tunnel",
      script: "cloudflared",
      args: "tunnel run --config /etc/cloudflared/config.yml",
      exec_mode: "fork",
      instances: 1,
      autorestart: true
    }
  ]
};
