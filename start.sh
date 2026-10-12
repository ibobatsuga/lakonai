#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
exec node backend/node-server.mjs
