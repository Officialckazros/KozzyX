#!/bin/bash

# Configuration
INSTANCE_NAME="discordbot"
ZONE="us-west1-a"
REMOTE_DIR="~/my-discord-bot"

echo "🚀 Starting sync to Google Cloud VM ($INSTANCE_NAME)..."

# Ensure the remote directory exists
gcloud compute ssh "$INSTANCE_NAME" --zone="$ZONE" --command="mkdir -p $REMOTE_DIR"

# Copy exactly the files we need (avoids node_modules and sqlite db)
gcloud compute scp --recurse \
    package.json index.js ecosystem.config.cjs sync_commands.js src website \
    "$INSTANCE_NAME:$REMOTE_DIR/" \
    --zone="$ZONE"

if [ $? -eq 0 ]; then
    echo "✅ Sync complete!"
    echo "💡 To start/restart your bot on the VM, run:"
    echo "   gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command=\"cd $REMOTE_DIR && npm install && npm run deploy && pm2 start ecosystem.config.cjs\""
else
    echo "❌ Sync failed. Please check your gcloud authentication and VM status."
fi
