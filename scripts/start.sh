#!/bin/sh
set -eu

if [ "${DRCROP_GBRAIN:-1}" != "0" ]; then
  gbrain init --pglite --non-interactive >/tmp/drcrop-gbrain-init.log 2>&1 || {
    cat /tmp/drcrop-gbrain-init.log >&2
    exit 1
  }
fi

exec node server.js
