#!/bin/bash

# Configuration
INSTANCE_NAME="discordbot"
ZONE="us-west1-a"
REMOTE_DIR="~/my-discord-bot"

echo "🚀 Starting sync to Google Cloud VM ($INSTANCE_NAME)..."

# Use gcloud compute rsync to efficiently sync files
# --exclude patterns to avoid bloating the transfer
gcloud compute rsync . "$INSTANCE_NAME:$REMOTE_DIR" \
    --zone="$ZONE" \
    --recursive \
    --delete-excluded \
    --exclude="node_modules/*" \
    --exclude=".git/*" \
    --exclude=".DS_Store" \
    --exclude="*.log" \
    --exclude="database.sqlite" # Exclude DB if you want to keep VM data separate

if [ $? -eq 0 ]; then
    echo "✅ Sync complete!"
    echo "💡 To start your bot on the VM, SSH in and run:"
    echo "   gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command=\"cd $REMOTE_DIR && npm install && npm start\""
else
    echo "❌ Sync failed. Please check your gcloud authentication and VM status."
fi
