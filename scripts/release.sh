#!/usr/bin/env bash
set -euo pipefail

# Usage: pnpm release <version>
# Example: pnpm release 0.4.0

VERSION="${1:-}"

# --- Validate input ---
if [ -z "$VERSION" ]; then
  echo "❌ No version provided."
  echo "   Usage: pnpm release <version>"
  echo "   Example: pnpm release 0.4.0"
  exit 1
fi

# Strip leading 'v' if provided (we'll add it back)
VERSION="${VERSION#v}"

# Basic semver format check
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
  echo "❌ Invalid version format: '$VERSION'"
  echo "   Expected semver e.g. 1.2.3 or 1.2.3-beta.1"
  exit 1
fi

TAG="v${VERSION}"


# --- Check we're on main ---
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "❌ You must be on the 'main' branch to release. Currently on: '$CURRENT_BRANCH'"
  exit 1
fi


# --- Check tag doesn't already exist ---
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Tag '$TAG' already exists."
  exit 1
fi

# --- Pull latest ---
echo "🔄 Pulling latest changes from origin/main..."
git pull --ff-only origin main

# --- Show commits since last tag ---
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  echo ""
  echo "📋 Commits since $LAST_TAG:"
  git --no-pager log "${LAST_TAG}..HEAD" --pretty=format:"  - %s (%h)" --no-merges
  echo ""
else
  echo "📋 No previous tag found — this will be the first release."
fi

# --- Confirm ---
echo ""
if [ -n "$LAST_TAG" ]; then
  echo "🚀 About to create and push tag: $TAG  (previous: $LAST_TAG)"
else
  echo "🚀 About to create and push tag: $TAG  (first release)"
fi
read -r -p "   Proceed? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# --- Tag and push ---
git tag "$TAG"
git push origin "$TAG"

echo ""
echo "✅ Tag '$TAG' pushed. CI/CD will now build and publish the release."
echo "   Watch progress at: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/' | sed 's/.*github.com[:/]//')/actions"

