#!/bin/sh
# macOS / Linux 安装入口：先保证有可用的 Node，再交给 scripts/install.mjs 干剩下的活。
set -eu

REPO=$(cd "$(dirname "$0")/.." && pwd)
MIN_CHECK='const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>20||(a===20&&b>=3)?0:1)'

if command -v node >/dev/null 2>&1 && node -e "$MIN_CHECK" 2>/dev/null; then
  exec node "$REPO/scripts/install.mjs" "$@"
fi

case "$(uname -s)" in
  Darwin) PLATFORM=darwin ;;
  Linux) PLATFORM=linux ;;
  *) echo "不支持的平台：$(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) ARCH=arm64 ;;
  x86_64 | amd64) ARCH=x64 ;;
  *) echo "不支持的架构：$(uname -m)" >&2; exit 1 ;;
esac

VERSION=$(curl -fsSL --max-time 20 https://nodejs.org/dist/index.json 2>/dev/null |
  tr ',' '\n' | grep -o '"version":"v22\.[0-9]*\.[0-9]*"' | head -1 | cut -d'"' -f4 || true)
[ -n "${VERSION:-}" ] || VERSION=v22.23.2

RUNTIME="$HOME/.wx2md/runtime"
rm -rf "$RUNTIME/node"
mkdir -p "$RUNTIME"
echo "本机没有可用的 Node，正在下载便携版 Node $VERSION（约 40MB）…"
curl -fsSL "https://nodejs.org/dist/$VERSION/node-$VERSION-$PLATFORM-$ARCH.tar.gz" | tar -xz -C "$RUNTIME"
mv "$RUNTIME/node-$VERSION-$PLATFORM-$ARCH" "$RUNTIME/node"

exec "$RUNTIME/node/bin/node" "$REPO/scripts/install.mjs" "$@"
