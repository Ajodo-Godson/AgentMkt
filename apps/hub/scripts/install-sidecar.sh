#!/usr/bin/env bash
# =============================================================================
# Install the Lexe sidecar binary into apps/hub/bin/.
#
# This is a placeholder script — the actual download URL depends on Lexe's
# release artifacts. As of April 2026, Lexe ships per-OS binaries via their
# docs at https://docs.lexe.tech (Sidecar SDK section).
#
# Steps when you run this manually:
#   1. Sign up at https://docs.lexe.tech and create a node.
#   2. Download the platform-appropriate sidecar binary from the releases page
#      of https://github.com/lexe-app/lexe-sidecar-sdk
#   3. Place the binary at apps/hub/bin/lexe-sidecar and chmod +x it.
#   4. Save your client credentials into the LEXE_CLIENT_CREDENTIALS env var
#      in your repo-root .env file.
#   5. Run: pnpm dev:hub  → the hub will spawn the sidecar automatically.
# =============================================================================
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
HUB_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
BIN_DIR="$HUB_ROOT/bin"
TARGET="$BIN_DIR/lexe-sidecar"

mkdir -p "$BIN_DIR"

if [[ -x "$TARGET" ]]; then
  echo "Sidecar already installed at $TARGET"
  "$TARGET" --version || true
  exit 0
fi

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
case "$OS-$ARCH" in
  darwin-arm64)   PLATFORM="macos-arm64"   ;;
  darwin-x86_64)  PLATFORM="macos-x86_64"  ;;
  linux-x86_64)   PLATFORM="linux-x86_64"  ;;
  linux-aarch64)  PLATFORM="linux-arm64"   ;;
  *)
    echo "Unsupported OS/arch: $OS/$ARCH" >&2
    echo "Download manually from https://github.com/lexe-app/lexe-sidecar-sdk/releases" >&2
    exit 1
    ;;
esac

cat <<EOF
========================================================================
MANUAL DOWNLOAD REQUIRED

The Lexe sidecar binary needs to be downloaded for platform: $PLATFORM

  1. Open: https://github.com/lexe-app/lexe-sidecar-sdk/releases
  2. Download the latest "$PLATFORM" binary.
  3. Move it to: $TARGET
  4. chmod +x $TARGET

Then re-run: pnpm dev:hub
========================================================================
EOF
exit 1
