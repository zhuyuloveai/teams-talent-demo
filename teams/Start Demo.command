#!/bin/zsh
set -eu
cd "$(dirname "$0")"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
node scripts/launch.mjs
