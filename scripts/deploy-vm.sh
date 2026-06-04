#!/bin/bash

INSTANCE_NAME="discordbot"
ZONE="us-west1-a"
VM_USER="bazsi9849"
REMOTE_DIR="/home/bazsi9849/my-discord-bot"
LAST_DEPLOY_FILE="config/.last-deploy-commit"

CURRENT_COMMIT=$(git rev-parse HEAD)

# Determine which files changed
if [ -f "$LAST_DEPLOY_FILE" ]; then
    LAST_COMMIT=$(cat "$LAST_DEPLOY_FILE")
    CHANGED_FILES=$(git diff --name-only "$LAST_COMMIT" "$CURRENT_COMMIT" 2>/dev/null)
else
    echo "No previous deploy found — doing full deploy..."
    CHANGED_FILES=$(git ls-files -- src website package.json config/)
fi

# Filter out files we never deploy
DEPLOY_FILES=()
while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    [[ "$file" == node_modules* || "$file" == data/* || "$file" == *.sqlite* || "$file" == .env* || "$file" == scripts/* || "$file" == .gitignore ]] && continue
    [[ ! -f "$file" ]] && echo "Skipping deleted: $file" && continue
    DEPLOY_FILES+=("$file")
done <<< "$CHANGED_FILES"

if [ ${#DEPLOY_FILES[@]} -eq 0 ]; then
    echo "Nothing to deploy — no changes since last deploy ($(git rev-parse --short "$LAST_COMMIT"))."
    exit 0
fi

echo "Deploying ${#DEPLOY_FILES[@]} changed file(s) to $VM_USER@$INSTANCE_NAME..."

FAILED=0
for file in "${DEPLOY_FILES[@]}"; do
    echo "  -> $file"
    remote_dir=$(dirname "$REMOTE_DIR/$file")
    gcloud compute ssh "$VM_USER@$INSTANCE_NAME" --zone="$ZONE" \
        --command="mkdir -p $remote_dir" 2>/dev/null
    gcloud compute scp "$file" "$VM_USER@$INSTANCE_NAME:$REMOTE_DIR/$file" --zone="$ZONE"
    if [ $? -ne 0 ]; then
        echo "  FAILED: $file"
        FAILED=1
    fi
done

if [ $FAILED -eq 1 ]; then
    echo "Some files failed to copy. Not restarting bot."
    exit 1
fi

echo "$CURRENT_COMMIT" > "$LAST_DEPLOY_FILE"

echo "Restarting bot..."
gcloud compute ssh "$VM_USER@$INSTANCE_NAME" --zone="$ZONE" --command="pm2 restart KozzyX"

if [ $? -eq 0 ]; then
    echo "Done. Deployed $(git rev-parse --short "$CURRENT_COMMIT")."
else
    echo "Restart failed. Check: pm2 logs KozzyX"
    exit 1
fi
