import { env } from "@/env"

/**
 * The OAuth broker — a dedicated, brand-neutral host (GHL/LeadConnector-style)
 * used as the `redirect_uri` for inherited/platform-owned OAuth credentials
 * and self-hosted editions. A tenant-owned credential (a reseller's own
 * provider app, `Credential.userId` set) instead uses that reseller's active
 * custom domain — see `lib/provider-origin.ts`, the actual source of truth
 * for "which origin does this credential's redirect_uri use". Either way, a
 * callback that lands on a host different from where the flow started is
 * relayed back to the originating domain (see `oauth-referer.ts`), so the
 * code exchange and cookie write happen where the user's session actually
 * lives.
 *
 * Falls back to `NEXT_PUBLIC_BUILDER_URL` when no dedicated broker is configured,
 * keeping single-domain deployments unchanged.
 */
export function getBrokerOrigin(): string {
  return new URL(env.NEXT_PUBLIC_BROKER_URL ?? env.NEXT_PUBLIC_BUILDER_URL)
    .origin
}

/** Build an absolute callback URL on the broker host for the given path. */
export function buildBrokerCallbackUrl(path: string): string {
  return new URL(path, getBrokerOrigin()).toString()
}

/** Whether the given request hostname is the broker host. */
export function isBrokerHost(host: string): boolean {
  return host === new URL(getBrokerOrigin()).hostname
}
