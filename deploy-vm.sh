#!/bin/bash

# Configuration
INSTANCE_NAME="discordbot"
ZONE="us-west1-a"
VM_USER="bazsi9849"
REMOTE_DIR="/home/bazsi9849/my-discord-bot"

echo "Deploying to $VM_USER@$INSTANCE_NAME..."

# Copy source files (skip node_modules, sqlite db, .env, data)
gcloud compute scp --recurse \
    package.json index.js ecosystem.config.cjs src website \
    "$VM_USER@$INSTANCE_NAME:$REMOTE_DIR/" \
    --zone="$ZONE"

if [ $? -ne 0 ]; then
    echo "Sync failed. Check your gcloud authentication and VM status."
    exit 1
fi

echo "Files synced. Restarting bot..."

gcloud compute ssh "$VM_USER@$INSTANCE_NAME" --zone="$ZONE" \
    --command="pm2 restart KozzyX"

if [ $? -eq 0 ]; then
    echo "Done. Bot is running."
else
    echo "Restart failed. SSH in and check: pm2 logs KozzyX"
    exit 1
fi
