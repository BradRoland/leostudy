module.exports = {
  apps: [
    {
      name: 'leo-stripe-webhook',
      cwd: __dirname,
      script: 'npm',
      args: 'run stripe:webhook',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      watch: false,
      max_restarts: 10,
    },
  ],
}
