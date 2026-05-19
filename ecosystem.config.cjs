module.exports = {
  apps: [
    {
      name: "mod-bot",
      script: "./index.js",
      // Disabled watch for production to avoid restart loops from editor/file changes
      watch: false,
      ignore_watch: ["node_modules", "data", "website", "*.json"],
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
