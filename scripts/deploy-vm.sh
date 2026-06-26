#!/bin/bash
# Legacy script for old VM/Google Cloud deploys.
# Project is now fully on Railway. Use deploy-everywhere.sh or just git push.
# Railway auto-deploys on push to the connected repo.

cd "$(dirname "$0")/.."

ENV_FILE="config/.env"
if [ -f "$ENV_FILE" ]; then
    while IFS= read -r line || [ -n "$line" ]; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ "$line" =~ ^[[:space:]]*$ ]] && continue

        if [[ "$line" =~ ^[[:space:]]*([^=[:space:]]+)[[:space:]]*=[[:space:]]*(.*)$ ]]; then
            key="${BASH_REMATCH[1]}"
            val="${BASH_REMATCH[2]}"
            val="${val#\"}"
            val="${val%\"}"
            val="${val#\'}"
            val="${val%\'}"
            export "$key"="$val"
        fi
    done < "$ENV_FILE"
fi

VM_USER="${DEPLOY_VM_USER}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR}"
SSH_HOST="${DEPLOY_SSH_HOST:-$DEPLOY_VM_USER}"
LAST_DEPLOY_FILE="${DEPLOY_LAST_DEPLOY_FILE:-config/.last-deploy-commit}"

MISSING_VARS=()
[ -z "$VM_USER" ] && MISSING_VARS+=("DEPLOY_VM_USER")
[ -z "$REMOTE_DIR" ] && MISSING_VARS+=("DEPLOY_REMOTE_DIR")
[ -z "$SSH_HOST" ] && MISSING_VARS+=("DEPLOY_SSH_HOST or DEPLOY_VM_USER")

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "Error: Missing required deployment environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    echo "Please define these variables in '$ENV_FILE' or export them in your environment."
    exit 1
fi

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
if [ -n "$DEPLOY_SSH_KEY" ]; then
    SSH_OPTS+=(-i "$DEPLOY_SSH_KEY")
fi

ssh_cmd() {
    ssh "${SSH_OPTS[@]}" "$SSH_HOST" "$@"
}

scp_cmd() {
    scp "${SSH_OPTS[@]}" "$@"
}

CURRENT_COMMIT=$(git rev-parse HEAD)

if [ -f "$LAST_DEPLOY_FILE" ]; then
    LAST_COMMIT=$(cat "$LAST_DEPLOY_FILE")
    CHANGED_FILES=$(git diff --name-only "$LAST_COMMIT" "$CURRENT_COMMIT" 2>/dev/null)
else
    echo "No previous deploy found — doing full deploy..."
    CHANGED_FILES=$(git ls-files -- src website package.json config/)
fi

DEPLOY_FILES=()
DELETE_FILES=()
while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    [[ "$file" == node_modules* || "$file" == data/* || "$file" == *.sqlite* || "$file" == .env* || "$file" == scripts/* || "$file" == .gitignore ]] && continue
    if [[ ! -f "$file" ]]; then
        echo "Will remove deleted: $file"
        DELETE_FILES+=("$file")
        continue
    fi
    DEPLOY_FILES+=("$file")
done <<< "$CHANGED_FILES"

if [ ${#DEPLOY_FILES[@]} -eq 0 ] && [ ${#DELETE_FILES[@]} -eq 0 ]; then
    echo "Nothing to deploy — no changes since last deploy ($(git rev-parse --short "$LAST_COMMIT"))."
    exit 0
fi

echo "Deploying to $SSH_HOST ($REMOTE_DIR)..."

FAILED=0
for file in "${DEPLOY_FILES[@]}"; do
    echo "  -> $file"
    remote_dir=$(dirname "$REMOTE_DIR/$file")
    ssh_cmd "mkdir -p $remote_dir"
    scp_cmd "$file" "$SSH_HOST:$REMOTE_DIR/$file"
    if [ $? -ne 0 ]; then
        echo "  FAILED: $file"
        FAILED=1
    fi
done

for file in "${DELETE_FILES[@]}"; do
    echo "  -x $file"
    ssh_cmd "rm -f $REMOTE_DIR/$file"
    if [ $? -ne 0 ]; then
        echo "  FAILED to delete: $file"
        FAILED=1
    fi
done

if [ $FAILED -eq 1 ]; then
    echo "Some files failed to copy or delete. Not restarting bot."
    exit 1
fi

echo "$CURRENT_COMMIT" > "$LAST_DEPLOY_FILE"

echo "Restarting bot..."
ssh_cmd "pm2 restart KozzyX"

if [ $? -eq 0 ]; then
    echo "Done. Deployed $(git rev-parse --short "$CURRENT_COMMIT")."
else
    echo "Restart failed. Check: pm2 logs KozzyX"
    exit 1
fi