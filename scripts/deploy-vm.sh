#!/bin/bash

# Load environment variables from config/.env if it exists
ENV_FILE="config/.env"
if [ -f "$ENV_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        # Ignore comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" =~ ^[[:space:]]*$ ]] && continue
        
        # Parse key=value
        if [[ "$line" =~ ^[[:space:]]*([^=[:space:]]+)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            val="${BASH_REMATCH[2]}"
            # Strip outer single/double quotes
            val="${val#\"}"
            val="${val%\"}"
            val="${val#\'}"
            val="${val%\'}"
            export "$key"="$val"
        fi
    done < "$ENV_FILE"
fi

# Assign deployment variables from environment
INSTANCE_NAME="${DEPLOY_INSTANCE_NAME}"
ZONE="${DEPLOY_ZONE}"
VM_USER="${DEPLOY_VM_USER}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR}"
LAST_DEPLOY_FILE="${DEPLOY_LAST_DEPLOY_FILE:-config/.last-deploy-commit}"

# Validate required variables
MISSING_VARS=()
[ -z "$INSTANCE_NAME" ] && MISSING_VARS+=("DEPLOY_INSTANCE_NAME")
[ -z "$ZONE" ] && MISSING_VARS+=("DEPLOY_ZONE")
[ -z "$VM_USER" ] && MISSING_VARS+=("DEPLOY_VM_USER")
[ -z "$REMOTE_DIR" ] && MISSING_VARS+=("DEPLOY_REMOTE_DIR")

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "❌ Error: Missing required deployment environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo "Please define these variables in '$ENV_FILE' or export them in your environment."
    exit 1
fi


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
