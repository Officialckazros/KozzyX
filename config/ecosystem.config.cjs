module.exports = {
  apps: [
    {
      name: "mod-bot",
      script: "./src/index.js",
      node_args: "--env-file=config/.env",
      
      watch: false,
      ignore_watch: ["node_modules", "data", "website", "*.json"],
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
