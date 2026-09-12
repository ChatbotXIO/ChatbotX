#!/usr/bin/env bash
# WhatsApp Calling / FreeSWITCH DNS + TLS preflight.
#
# Verifies, before relying on a FreeSWITCH node in production, that:
#   1. FS_SIP_DOMAIN resolves via a public DNS A record.
#   2. The TLS listeners Meta and browsers/coturn will connect to present
#      a certificate that validates for that hostname, using the exact
#      command Meta's own SIP configuration doc recommends for testing
#      certificate validity:
#        openssl s_client -quiet -verify_hostname {hostname} \
#          -connect {hostname}:{port}
#      (verified via WebFetch against
#      developers.facebook.com/documentation/business-messaging/whatsapp/calling/sip
#      while writing this script).
#
# Exit status: 0 only if every check passes. Non-zero (with the first
# failing check named) otherwise, so this is safe to wire into a release
# gate or a cron-based renewal-hook health check (run off-hours).
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/whatsapp-sip-preflight.sh <hostname> [port...]

Checks that <hostname> has a public DNS A record and that each TLS port
(default: 5061 7443 5349) presents a certificate valid for <hostname>.

Examples:
  scripts/whatsapp-sip-preflight.sh fs.example.com
  scripts/whatsapp-sip-preflight.sh fs.example.com 5061 7443 5349

Env:
  PREFLIGHT_TIMEOUT_SECONDS   Per-check timeout (default: 10).
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ] || [ $# -lt 1 ]; then
  usage
  exit "$([ $# -lt 1 ] && echo 1 || echo 0)"
fi

HOSTNAME_ARG="$1"
shift
PORTS=("$@")
if [ "${#PORTS[@]}" -eq 0 ]; then
  PORTS=(5061 7443 5349)
fi
TIMEOUT="${PREFLIGHT_TIMEOUT_SECONDS:-10}"

# `timeout` is GNU coreutils and is not installed on macOS by default
# (Homebrew's coreutils provides it as `gtimeout`). Fall back to running
# openssl without a timeout wrapper when neither is available, warning once.
TIMEOUT_BIN="$(command -v timeout || command -v gtimeout || true)"
if [ -z "$TIMEOUT_BIN" ]; then
  printf '%s\n' "WARN: neither 'timeout' nor 'gtimeout' is installed — running without a per-check timeout." >&2
fi

fail_count=0

log() {
  printf '%s\n' "$*"
}

check_dns() {
  log "-> dig +short A ${HOSTNAME_ARG}"
  if ! command -v dig >/dev/null 2>&1; then
    log "   FAIL: 'dig' is not installed"
    fail_count=$((fail_count + 1))
    return
  fi
  local answer
  answer="$(dig +short A "$HOSTNAME_ARG" | head -1)"
  if [ -z "$answer" ]; then
    log "   FAIL: no A record for ${HOSTNAME_ARG}"
    fail_count=$((fail_count + 1))
    return
  fi
  log "   OK: ${HOSTNAME_ARG} -> ${answer}"
}

check_tls_port() {
  local port="$1"
  log "-> openssl s_client -quiet -verify_hostname ${HOSTNAME_ARG} -connect ${HOSTNAME_ARG}:${port}"
  if ! command -v openssl >/dev/null 2>&1; then
    log "   FAIL: 'openssl' is not installed"
    fail_count=$((fail_count + 1))
    return
  fi

  local output
  local status
  set +e
  output="$(printf '' | ${TIMEOUT_BIN:+"$TIMEOUT_BIN" "${TIMEOUT}s"} openssl s_client -quiet \
    -verify_hostname "$HOSTNAME_ARG" -connect "${HOSTNAME_ARG}:${port}" 2>&1)"
  status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    log "   FAIL: connection or hostname verification failed (exit ${status})"
    log "$output" | sed 's/^/   | /'
    fail_count=$((fail_count + 1))
    return
  fi

  if printf '%s' "$output" | grep -qi "Verify return code: 0 (ok)"; then
    log "   OK: certificate valid for ${HOSTNAME_ARG}:${port}"
  else
    log "   FAIL: certificate did not verify for ${HOSTNAME_ARG}:${port}"
    log "$output" | grep -i "verify" | sed 's/^/   | /'
    fail_count=$((fail_count + 1))
  fi
}

log "WhatsApp Calling SIP/TLS preflight for ${HOSTNAME_ARG}"
log ""
check_dns
log ""
for port in "${PORTS[@]}"; do
  check_tls_port "$port"
  log ""
done

if [ "$fail_count" -gt 0 ]; then
  log "RESULT: ${fail_count} check(s) failed."
  exit 1
fi

log "RESULT: all checks passed."
