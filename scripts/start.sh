#!/bin/sh
set -eu

if [ "${DRCROP_GBRAIN:-1}" != "0" ]; then
  GBRAIN_STORE="${HOME:-/root}/.gbrain/brain.pglite"
  if [ ! -e "$GBRAIN_STORE" ]; then
    gbrain init --pglite --non-interactive >/tmp/drcrop-gbrain-init.log 2>&1 || {
      cat /tmp/drcrop-gbrain-init.log >&2
      exit 1
    }
  fi
fi

exec node server.js
