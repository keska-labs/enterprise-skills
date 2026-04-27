#!/usr/bin/env bash
# Extract icon from the latest packaged .vsix and print dimensions.
# Run from repo root after: npm run vsix
set -euo pipefail
cd "$(dirname "$0")/.."
vsix=$(ls -t agent-skill-sync-*.vsix 2>/dev/null | head -1 || true)
if [[ -z "${vsix}" ]]; then
  echo "No agent-skill-sync-*.vsix in repo root. Run: npm run vsix" >&2
  exit 1
fi
echo "Using: ${vsix}"
unzip -p "${vsix}" extension/media/icon.png > /tmp/agent-skill-sync-icon-from-vsix.png
if command -v sips >/dev/null 2>&1; then
  sips -g pixelWidth -g pixelHeight /tmp/agent-skill-sync-icon-from-vsix.png
else
  file /tmp/agent-skill-sync-icon-from-vsix.png
fi
echo ""
echo "Open the extracted file in an image viewer (100% zoom):"
echo "  /tmp/agent-skill-sync-icon-from-vsix.png"
echo "The logo should fill most of the square — not a small blob in a corner."
