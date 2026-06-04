#!/bin/bash

# Ensure we are in the root directory of the repo
cd "$(dirname "$0")/.."

# Check if there are uncommitted or untracked changes
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️ You have uncommitted or untracked changes:"
    git status --short
    echo
    read -p "Would you like to commit and deploy them? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter commit message: " commit_msg
        if [ -z "$commit_msg" ]; then
            echo "❌ Commit message cannot be empty. Aborting."
            exit 1
        fi
        git add .
        git commit -m "$commit_msg"
    else
        echo "❌ Please commit your changes before deploying. Aborting."
        exit 1
    fi
fi

# Push to GitHub
echo "🚀 Pushing changes to GitHub..."
CURRENT_BRANCH=$(git branch --show-current)
git push origin "$CURRENT_BRANCH"
if [ $? -ne 0 ]; then
    echo "❌ Failed to push to GitHub. Aborting deployment."
    exit 1
fi
echo "✅ Successfully pushed to GitHub ($CURRENT_BRANCH)."

# Deploy to VM
echo "🖥️ Deploying to VM..."
./scripts/deploy-vm.sh
