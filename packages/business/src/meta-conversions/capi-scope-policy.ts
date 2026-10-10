import type { MetaConversionsChannel } from "./schema"

/**
 * Whether sending Conversions API events on a channel requires the Meta
 * events scope to be granted on our token. WhatsApp is exempt: Meta records
 * `whatsapp_business_manage_events` against the Business Presence account,
 * our token check cannot see it reliably, and a WABA that truly lacks it
 * gets Meta's `(#200)` error on send — so Meta is the arbiter there.
 */
export const CAPI_SCOPE_REQUIRED_BY_CHANNEL: Record<
  MetaConversionsChannel,
  boolean
> = {
  messenger: true,
  instagram: true,
  whatsapp: false,
}

export const isCapiScopeRequired = (channel: MetaConversionsChannel): boolean =>
  CAPI_SCOPE_REQUIRED_BY_CHANNEL[channel]
