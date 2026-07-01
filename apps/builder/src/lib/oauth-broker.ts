import { env } from "@/env"

/**
 * The OAuth broker — a dedicated, brand-neutral host (GHL/LeadConnector-style)
 * registered as the single `redirect_uri` with every OAuth provider (Google,
 * Facebook, TikTok, Google Sheets, …). Every white-label callback lands here and
 * is then relayed back to the originating domain (see `oauth-referer.ts`), so the
 * code exchange and cookie write happen where the user's session actually lives.
 *
 * Webhook *receive* URLs for providers that validate the registered host (e.g.
 * WhatsApp/Meta, TikTok) also use this broker origin, not just OAuth redirects —
 * the provider cannot reach an unregistered white-label custom domain.
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
