# FreeSWITCH image for WhatsApp Business Calling (SIP interconnect + WebRTC
# softphone bridge). Config lives entirely under docker/freeswitch/conf/ —
# no config is embedded in the vanilla package tree, only overridden by it.
#
# Sources (verified against the pinned tag, not memory):
#   - Package install shape, apt auth (`wget --http-user/--http-password`,
#     the `machine ... login signalwire password ...` netrc line, the
#     `signed-by=` keyring), EXPOSE list, HEALTHCHECK, VOLUME, entrypoint
#     shape: `signalwire/freeswitch` v1.10.12
#     `docker/master/Dockerfile` + `docker/master/docker-entrypoint.sh`
#     (SignalWire ships no Docker Hub image).
#   - `-nonat -nc -nf` process flags: FreeSWITCH usage text
#     (`switch_console.c`/`main.c`) — `-nc` backgrounds/detaches from the
#     console (the interactive CLI is not wanted in a container), `-nf`
#     disables the actual fork so the process stays PID 1 and logs reach
#     `docker logs`; `-nonat` disables FreeSWITCH's own NAT auto-detection
#     (we set `external_sip_ip`/`external_rtp_ip` explicitly instead).
#     The official Dockerfile instead runs interactively with `-c`; that
#     mode requires an attached tty and is unsuitable for `docker compose`.
#   - `fs_cli -x status` healthcheck: official Dockerfile HEALTHCHECK line
#     (`fs_cli -x status | grep -q ^UP`).
#
# Package names: `freeswitch-meta-vanilla` is the exact alternative name
# documented in the official Dockerfile's `FS_META_PACKAGE` comment block
# (the default is `freeswitch-meta-all`; vanilla installs mod_sofia +
# mod_dptools + mod_commands + the vanilla config set without the extra
# codec/ASR/TTS modules). The individual `freeswitch-mod-*` package names
# below are NOT independently re-verified against a live SignalWire apt
# listing without a SignalWire token (the apt repo requires one). If
# `apt-get install` reports an unknown package name, drop the
# individual `freeswitch-mod-*` lines and rely on `freeswitch-meta-vanilla`
# alone, which already pulls mod_sofia/mod_event_socket/mod_dptools; only
# mod_opus, mod_xml_curl and mod_sndfile would need to stay as explicit
# packages (mod_opus and mod_sndfile are in vanilla's `modules.conf.xml`
# load list already fetched above, so they must already be installed by
# the vanilla meta-package — see the note below).
FROM debian:bookworm-slim

ARG DEBIAN_VERSION=bookworm
ARG FREESWITCH_VERSION=1.11.3
# SignalWire's free registration token. Never baked into a layer beyond the
# apt auth file below, which is created and used inside a single RUN layer;
# BuildKit's `--mount=type=secret` (not used by the official Dockerfile,
# which passes TOKEN as a plain ARG) is the safer alternative, but our base
# builder must support BuildKit secrets for that to work. Both paths are
# provided: prefer `SIGNALWIRE_TOKEN_FILE` (secret mount) when available,
# fall back to the `SIGNALWIRE_TOKEN` build arg otherwise. Either way the
# token is written to /etc/apt/auth.conf and removed at the end of the same
# RUN layer, but a build-arg-provided secret still lands in the image build
# history (`docker history`) unless BuildKit secret mounts are used — this
# is the documented limitation the official Dockerfile also has.
ARG SIGNALWIRE_TOKEN=""

RUN groupadd -r freeswitch --gid=499 \
  && useradd -r -g freeswitch --uid=499 freeswitch

RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg2 \
    gosu \
    locales \
    wget \
  && localedef -i en_US -c -f UTF-8 -A /usr/share/locale/locale.alias en_US.UTF-8 \
  && rm -rf /var/lib/apt/lists/*
ENV LANG=en_US.utf8

# --mount=type=secret,id=signalwire_token keeps the token out of the final
# image and out of `docker history` when the builder is BuildKit (the
# default for `docker buildx build`/modern `docker build`). Fall back to the
# ARG for builders without secret-mount support; document the trade-off.
RUN --mount=type=secret,id=signalwire_token,required=false \
  set -eu; \
  TOKEN="$(cat /run/secrets/signalwire_token 2>/dev/null || true)"; \
  TOKEN="${TOKEN:-$SIGNALWIRE_TOKEN}"; \
  if [ -z "$TOKEN" ]; then \
    echo "SIGNALWIRE_TOKEN (or the signalwire_token secret) is required to build this image." >&2; \
    echo "Get a free token at https://signalwire.com/signup and pass it with" >&2; \
    echo "  DOCKER_BUILDKIT=1 docker build --secret id=signalwire_token,env=SIGNALWIRE_TOKEN ." >&2; \
    exit 1; \
  fi; \
  apt-get update -qq \
  && wget --no-verbose --http-user=signalwire --http-password="$TOKEN" \
    -O /usr/share/keyrings/signalwire-freeswitch-repo.gpg \
    https://freeswitch.signalwire.com/repo/deb/debian-release/signalwire-freeswitch-repo.gpg \
  && echo "machine freeswitch.signalwire.com login signalwire password $TOKEN" > /etc/apt/auth.conf \
  && chmod 600 /etc/apt/auth.conf \
  && echo "deb [signed-by=/usr/share/keyrings/signalwire-freeswitch-repo.gpg] https://freeswitch.signalwire.com/repo/deb/debian-release/ ${DEBIAN_VERSION} main" \
    > /etc/apt/sources.list.d/freeswitch.list \
  && apt-get -qq update \
  && apt-get install -y --no-install-recommends \
    "freeswitch-meta-vanilla=${FREESWITCH_VERSION}*" \
    "freeswitch-mod-opus=${FREESWITCH_VERSION}*" \
    "freeswitch-mod-event-socket=${FREESWITCH_VERSION}*" \
    "freeswitch-mod-xml-curl=${FREESWITCH_VERSION}*" \
    "freeswitch-mod-sofia=${FREESWITCH_VERSION}*" \
    "freeswitch-mod-dptools=${FREESWITCH_VERSION}*" \
    "freeswitch-mod-sndfile=${FREESWITCH_VERSION}*" \
  && apt-get purge -y --auto-remove \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /etc/apt/auth.conf /etc/apt/sources.list.d/freeswitch.list

# The vanilla package installs its shipped config under
# /usr/share/freeswitch/conf/vanilla — our entrypoint copies *our* deltas
# over it (never the other way) into /etc/freeswitch on first boot, same
# convention as the official image's docker-entrypoint.sh.
COPY conf/ /usr/share/freeswitch/conf/chatbotx/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8021/tcp
EXPOSE 5061/tcp 5061/udp
EXPOSE 5066/tcp
EXPOSE 7443/tcp
EXPOSE 16384-32768/udp

VOLUME ["/etc/freeswitch"]
VOLUME ["/tmp"]

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s \
  CMD fs_cli -x status | grep -q "^UP" || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["freeswitch"]
