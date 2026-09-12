#!/bin/bash
# Entrypoint for the ChatbotX FreeSWITCH image.
#
# Responsibilities:
#   1. Seed /etc/freeswitch on first boot: vanilla package config, then our
#      deltas copied over it — same "copy vanilla, then overlay" convention
#      as the official signalwire/freeswitch docker-entrypoint.sh, which
#      does `cp -varf /usr/share/freeswitch/conf/vanilla/* /etc/freeswitch/`
#      on first boot only (checked via a marker file, not every start, so a
#      volume-mounted /etc/freeswitch persists local edits across restarts).
#   2. Render FS_* environment variables into an included vars file using
#      `<X-PRE-PROCESS cmd="set" .../>` lines — the same directive
#      FreeSWITCH's own freeswitch.xml uses to pull in vars.xml
#      (`<X-PRE-PROCESS cmd="include" data="vars.xml"/>`), so nesting one
#      more generated include inside vars.xml is the documented mechanism,
#      not a hack. FreeSWITCH re-reads this file on every start (and on
#      `reloadxml`), so a changed env var takes effect on container
#      restart without rebuilding the image.
#   3. Raise the file-descriptor ulimit (each RTP/SIP socket plus every
#      open recording file needs its own descriptor; the default 1024
#      is exhausted well before `max-sessions` under load).
#   4. Exec FreeSWITCH in the foreground as PID 1 (`-nc -nf`, see the
#      Dockerfile header comment for the flag citations).
set -euo pipefail

CONF_DELTA_DIR="/usr/share/freeswitch/conf/chatbotx"
CONF_VANILLA_DIR="/usr/share/freeswitch/conf/vanilla"
CONF_DIR="/etc/freeswitch"
FIRST_BOOT_MARKER="${CONF_DIR}/.chatbotx-seeded"

render_generated_vars() {
  # Every FreeSWITCH-side name here is consumed by docker/freeswitch/conf/
  # vars.xml (external_sip_ip / external_rtp_ip / domain / etc.) or by the
  # sip_profiles/dialplan files that read $${FS_NODE_ID} etc. directly —
  # see conf/vars.xml for the full list of consumers.
  local out="${CONF_DIR}/chatbotx-vars-generated.xml"
  {
    echo '<include>'
    [ -n "${FS_SIP_DOMAIN:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_SIP_DOMAIN=${FS_SIP_DOMAIN}\"/>"
    [ -n "${FS_PUBLIC_IP:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_PUBLIC_IP=${FS_PUBLIC_IP}\"/>"
    [ -n "${FS_ESL_PASSWORD:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_ESL_PASSWORD=${FS_ESL_PASSWORD}\"/>"
    [ -n "${FS_XML_BASIC_USER:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_XML_BASIC_USER=${FS_XML_BASIC_USER}\"/>"
    [ -n "${FS_XML_BASIC_PASS:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_XML_BASIC_PASS=${FS_XML_BASIC_PASS}\"/>"
    [ -n "${CBX_XML_URL:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"CBX_XML_URL=${CBX_XML_URL}\"/>"
    [ -n "${FS_NODE_ID:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_NODE_ID=${FS_NODE_ID}\"/>"
    [ -n "${FS_ESL_LISTEN_IP:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_ESL_LISTEN_IP=${FS_ESL_LISTEN_IP}\"/>"
    [ -n "${FS_RECORDINGS_DIR:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_RECORDINGS_DIR=${FS_RECORDINGS_DIR}\"/>"
    [ -n "${FS_RTP_START_PORT:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_RTP_START_PORT=${FS_RTP_START_PORT}\"/>"
    [ -n "${FS_RTP_END_PORT:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_RTP_END_PORT=${FS_RTP_END_PORT}\"/>"
    [ -n "${FS_MAX_SESSIONS:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_MAX_SESSIONS=${FS_MAX_SESSIONS}\"/>"
    [ -n "${FS_SESSIONS_PER_SECOND:-}" ] && echo "  <X-PRE-PROCESS cmd=\"set\" data=\"FS_SESSIONS_PER_SECOND=${FS_SESSIONS_PER_SECOND}\"/>"
    echo '</include>'
  } > "$out"
}

seed_config_on_first_boot() {
  if [ -f "$FIRST_BOOT_MARKER" ]; then
    return 0
  fi
  mkdir -p "$CONF_DIR"
  # 1) vanilla package config as the base (sounds, default dialplan bits we
  #    don't override, tls cert dir placeholder, etc.)
  cp -r "${CONF_VANILLA_DIR}"/. "$CONF_DIR"/
  # 2) our deltas on top — never the reverse, so a file we don't ship keeps
  #    the vanilla default.
  cp -r "${CONF_DELTA_DIR}"/. "$CONF_DIR"/
  touch "$FIRST_BOOT_MARKER"
}

raise_fd_limit() {
  # Best-effort: some container runtimes cap the hard limit below this: fall
  # back to the hard limit rather than failing the container.
  local want=65535
  local hard
  hard="$(ulimit -Hn 2>/dev/null || echo "$want")"
  if [ "$hard" = "unlimited" ]; then
    ulimit -Sn "$want" || true
  else
    ulimit -Sn "$(( hard < want ? hard : want ))" || true
  fi
}

main() {
  if [ "${1:-freeswitch}" != "freeswitch" ]; then
    exec "$@"
  fi

  seed_config_on_first_boot
  render_generated_vars
  raise_fd_limit

  chown -R freeswitch:freeswitch "$CONF_DIR" /var/run/freeswitch /var/lib/freeswitch /var/log/freeswitch 2>/dev/null || true

  # -nonat: we set external_sip_ip/external_rtp_ip explicitly (no STUN
  #         auto-detection wanted).
  # -nc:    do not attach the interactive console (unsuitable for a
  #         container with no tty).
  # -nf:    do not fork away from the foreground process — stay PID 1 so
  #         `docker stop`/healthcheck/log capture all work normally.
  exec gosu freeswitch /usr/bin/freeswitch -u freeswitch -g freeswitch -nonat -nc -nf
}

main "$@"
