import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import { FACEBOOK_ADS_SCOPES } from "@chatbotx.io/integration-facebook-ads"

/**
 * Per-channel scope additions on top of the base `FACEBOOK_ADS_SCOPES` — v3
 * correction #1 (out/plan/ctwa-ctm-ctid-box-merge.md). The base list covers
 * `pages_manage_ads`/`pages_read_engagement`/`pages_show_list` (CTM/CTWA
 * Page access). Channel extras:
 * - whatsapp: `whatsapp_business_management` (Phase-0-pinned hypothesis for
 *   CTWA promoted_object WhatsApp-number resolution) — WhatsApp-only so a
 *   CTM/CTID connect never asks for a WhatsApp permission it does not use.
 * - instagram: `instagram_basic` to read the connected Instagram account's
 *   identity.
 */
const MESSAGING_ADS_EXTRA_SCOPES: Record<
  MessagingAdChannel,
  readonly string[]
> = {
  whatsapp: ["whatsapp_business_management"],
  messenger: [],
  instagram: ["instagram_basic"],
}

export function messagingAdsScopesForChannel(
  channel: MessagingAdChannel,
): readonly string[] {
  const extra = MESSAGING_ADS_EXTRA_SCOPES[channel]
  return [...new Set([...FACEBOOK_ADS_SCOPES, ...extra])]
}
