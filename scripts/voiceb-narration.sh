#!/usr/bin/env bash
# Kiosk narration in the locked human voice "Voice B" (VoiceStudio profile b7af9f2a).
#
# VoiceStudio does not run on this laptop. It runs on the Mac mini
# (ssh host `mini`, user tesla, LAN name teslas-Mac-mini.local) out of the
# source checkout at /Users/tesla/VoiceStudio. Voice B lives only in that
# machine's profile database, so the mini is the only place this voice exists.
#
#   start_remote   start the uvicorn backend on the mini (idempotent)
#   tunnel         forward mini:3900 to localhost:3900
#   generate       render every line in LINES_FILE, serially, pinned to Voice B
#
# Every call sends profile_id AND the same seed. Mixing a seeded call with an
# unseeded one, or regenerating a single line later without these exact values,
# reintroduces the multi-voice bug for that line.

set -euo pipefail

HOST="${VOICESTUDIO_HOST:-localhost:3900}"
SSH_HOST="${VOICESTUDIO_SSH_HOST:-mini}"
REMOTE_REPO="${VOICESTUDIO_REMOTE_REPO:-/Users/tesla/VoiceStudio}"
PROFILE_ID="${VOICEB_PROFILE_ID:-b7af9f2a}"
SEED="${VOICEB_SEED:-42}"
OUT_DIR="${OUT_DIR:-/tmp/voiceb}"
LINES_FILE="${LINES_FILE:-${OUT_DIR}/lines.tsv}"
REQ_TIMEOUT="${REQ_TIMEOUT:-600}"

start_remote() {
  ssh -o BatchMode=yes "$SSH_HOST" "
    set -e
    if curl -sf -m 5 http://127.0.0.1:3900/health >/dev/null 2>&1; then
      echo 'backend already up'; exit 0
    fi
    cd '$REMOTE_REPO'
    nohup .venv/bin/python -m uvicorn main:app --app-dir backend \
      --host 0.0.0.0 --port 3900 > /tmp/voicestudio-backend.log 2>&1 < /dev/null &
    disown
    for i in \$(seq 1 60); do
      curl -sf -m 4 http://127.0.0.1:3900/health >/dev/null 2>&1 && { echo 'backend up'; exit 0; }
      sleep 2
    done
    echo 'backend did not come up in 120s' >&2
    tail -20 /tmp/voicestudio-backend.log >&2
    exit 1
  "
}

tunnel() {
  pkill -f "ssh -f -N -L 3900:127.0.0.1:3900" 2>/dev/null || true
  ssh -f -N -L 3900:127.0.0.1:3900 -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=30 "$SSH_HOST"
  sleep 2
  curl -sf -m 10 "http://${HOST}/health"
  echo
}

generate() {
  curl -sf -m 10 "http://${HOST}/health" >/dev/null \
    || { echo "VoiceStudio not reachable at ${HOST}. Run start_remote then tunnel." >&2; exit 1; }

  curl -s -m 20 "http://${HOST}/profiles" | grep -q "\"${PROFILE_ID}\"" \
    || { echo "Profile ${PROFILE_ID} is not present on this VoiceStudio. Refusing to guess a voice." >&2; exit 1; }

  mkdir -p "$OUT_DIR"
  while IFS=$'\t' read -r id text; do
    [ -z "${id:-}" ] && continue
    out="${OUT_DIR}/seg${id}.wav"
    code=$(curl -s -o "$out" -w "%{http_code}" -m "$REQ_TIMEOUT" \
      -X POST "http://${HOST}/generate" \
      --form-string "text=${text}" \
      --form-string "profile_id=${PROFILE_ID}" \
      --form-string "seed=${SEED}" \
      --form-string "language=English" \
      --form-string "effect_preset=broadcast")
    if [ "$code" != "200" ]; then
      echo "FAIL ${id}: HTTP ${code}" >&2
      head -c 400 "$out" >&2; echo >&2
      exit 1
    fi
    dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out")
    printf 'seg%s.wav  %ss\n' "$id" "$dur"
    sleep 1
  done < "$LINES_FILE"
}

case "${1:-generate}" in
  start_remote) start_remote ;;
  tunnel) tunnel ;;
  generate) generate ;;
  all) start_remote; tunnel; generate ;;
  *) echo "usage: $0 {start_remote|tunnel|generate|all}" >&2; exit 2 ;;
esac
