#!/usr/bin/env bash
# Regenerates docker/freeswitch/conf/autoload_configs/meta_sip_ranges.xml
# from the live AS32934 (Meta) route table.
#
# Source: Meta's SIP configuration doc says the SIP allowlist "uses the
# same IP addresses as ... Webhooks"; the Webhooks IP Addresses doc's only
# documented method (as of 2026-09-12, no static prefix list found) is a
# `whois` query against AS32934 or the published geofeed CSV. This script
# uses the whois method because it needs no extra tooling beyond `whois`.
#
# Usage: scripts/update-meta-sip-acl.sh
# Review the diff, then restart (not just `rescan`) the `whatsapp` sofia
# profile off-hours for the new ACL to take effect.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="${ROOT_DIR}/docker/freeswitch/conf/autoload_configs/meta_sip_ranges.xml"

if ! command -v whois >/dev/null 2>&1; then
  echo "error: 'whois' is required (brew install whois / apt-get install whois)" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: 'python3' is required to collapse the route list" >&2
  exit 1
fi

# IPv4 only: the `whatsapp` sofia profile binds IPv4. The raw
# RADB table lists hundreds of overlapping/adjacent routes; collapsing them
# (Meta's own FAQ example uses `cidrmerge` and lands on ~23 prefixes) keeps
# the ACL small and the per-INVITE ACL check cheap.
routes="$(whois -h whois.radb.net -- '-i origin AS32934' \
  | awk '/^route:/{print $2}' \
  | python3 -c '
import ipaddress, sys
networks = {ipaddress.ip_network(line.strip()) for line in sys.stdin if line.strip()}
for network in ipaddress.collapse_addresses(sorted(networks)):
    print(network)
')"

count="$(printf '%s\n' "$routes" | grep -c . || true)"
today="$(date -u +%Y-%m-%d)"

{
  echo "<!--"
  echo "  GENERATED FILE — do not hand-edit. Regenerate with:"
  echo "    scripts/update-meta-sip-acl.sh"
  echo "  which re-runs:"
  echo "    whois -h whois.radb.net \"-i origin AS32934\" (RADb, AS32934 = Meta)"
  echo "  Snapshot taken ${today} UTC. ${count} routes."
  echo "-->"
  printf '%s\n' "$routes" | while IFS= read -r cidr; do
    [ -n "$cidr" ] && printf '      <node type="allow" cidr="%s"/>\n' "$cidr"
  done
} > "$OUT_FILE"

echo "Wrote ${count} routes to ${OUT_FILE}"
echo "Review the diff, then restart the whatsapp sofia profile off-hours."
