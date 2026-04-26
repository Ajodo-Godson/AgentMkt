#!/usr/bin/env bash
# =============================================================================
# Install the Lexe sidecar binary into apps/hub/bin/lexe-sidecar.
#
# Pulls the latest pre-built release from
#   https://github.com/lexe-app/lexe-sidecar-sdk/releases
# Falls back to a pinned version if --version is supplied.
#
# Usage:
#   apps/hub/scripts/install-sidecar.sh            # latest
#   apps/hub/scripts/install-sidecar.sh v0.4.4     # pin
#
# After install:
#   - Make sure ~/.lexe/seedphrase.txt exists (lexe init).
#   - Set LEXE_ROOT_SEED_PATH=$HOME/.lexe/root_seed.hex in .env, or set
#     LEXE_CLIENT_CREDENTIALS for a wallet exported from the Lexe mobile app.
#   - Run: pnpm dev:hub
# =============================================================================
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
HUB_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
BIN_DIR="$HUB_ROOT/bin"
TARGET="$BIN_DIR/lexe-sidecar"

mkdir -p "$BIN_DIR"

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$OS-$ARCH" in
  darwin-arm64)        ASSET="lexe-sidecar-macos-aarch64.zip"   ;;
  darwin-x86_64)       ASSET="lexe-sidecar-macos-aarch64.zip"   ;;  # rosetta
  linux-x86_64)        ASSET="lexe-sidecar-linux-x86_64.zip"    ;;
  linux-aarch64)       ASSET="lexe-sidecar-linux-aarch64.zip"   ;;
  linux-arm64)         ASSET="lexe-sidecar-linux-aarch64.zip"   ;;
  *)
    echo "Unsupported OS/arch: $OS/$ARCH" >&2
    echo "Download manually from https://github.com/lexe-app/lexe-sidecar-sdk/releases" >&2
    exit 1
    ;;
esac

VERSION="${1:-latest}"
if [[ "$VERSION" == "latest" ]]; then
  TAG=$(curl -sL "https://api.github.com/repos/lexe-app/lexe-sidecar-sdk/releases/latest" \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['tag_name'])")
else
  TAG="$VERSION"
fi

URL="https://github.com/lexe-app/lexe-sidecar-sdk/releases/download/${TAG}/${ASSET}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $TAG ($ASSET) ..."
curl -sSLf -o "$TMP/sidecar.zip" "$URL"

echo "Unpacking ..."
unzip -q -o "$TMP/sidecar.zip" -d "$TMP/extracted"

# The zip layout from upstream is `lexe-sidecar-<platform>/lexe-sidecar` —
# locate the inner binary regardless of nesting.
INNER=$(find "$TMP/extracted" -type f -name "lexe-sidecar" -perm -u+x -print -quit)
if [[ -z "${INNER:-}" ]]; then
  INNER=$(find "$TMP/extracted" -type f -name "lexe-sidecar" -print -quit || true)
fi
if [[ -z "${INNER:-}" ]]; then
  echo "Could not locate lexe-sidecar binary in archive" >&2
  ls -R "$TMP/extracted" >&2
  exit 1
fi

mv "$INNER" "$TARGET"
chmod +x "$TARGET"

echo "Installed: $TARGET"

cat <<EOF

NEXT STEPS
  1. Ensure you have ~/.lexe/seedphrase.txt   (\`lexe init\` once if missing).
  2. If using the CLI wallet, derive a hex root seed at ~/.lexe/root_seed.hex
     and set:
       LEXE_ROOT_SEED_PATH=$HOME/.lexe/root_seed.hex
       LEXE_DATA_DIR=$HOME/.lexe
  4. Start the hub:                              \`pnpm dev:hub\`
  5. Sanity check the wallet:
       curl http://localhost:5393/v2/health
       curl http://localhost:5393/v2/node/node_info
EOF
