import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import type { MessagingAdsToolIntegration } from "../queries/tool-integrations"

export type MessagingAdsToolEmptyStateConfig = {
  /** `null` when the state reuses a single explanation paragraph instead
   * of a title + description pair (mirrors the source copy's own shape). */
  titleKey: string | null
  descriptionKey: string
  ctaKey: string
  href: (workspaceId: string) => string
}

/** Generic "nothing connected on this channel yet" state, channel-agnostic. */
export const NO_INTEGRATIONS_EMPTY_STATE: MessagingAdsToolEmptyStateConfig = {
  titleKey: "clickToMessageAds.empty.title",
  descriptionKey: "clickToMessageAds.empty.description",
  ctaKey: "clickToMessageAds.empty.cta",
  href: (workspaceId) => `/space/${workspaceId}/settings/channels`,
}

/**
 * Per-channel state for "integrations exist but none can host the box"
 * (`hasUnsupportedIntegrations` from `listMessagingAdsToolIntegrations`).
 * Channel facts live here, not in the view: a channel with no entry simply
 * never reports unsupported integrations, so the resolver falls back to the
 * generic state without a channel branch.
 */
export const UNSUPPORTED_INTEGRATIONS_EMPTY_STATE: Partial<
  Record<MessagingAdChannel, MessagingAdsToolEmptyStateConfig>
> = {
  instagram: {
    // No separate title — mirrors `instagram-capi-tab.tsx`'s unsupported
    // block (a single explanation paragraph + CTA), reusing the exact copy
    // already shown there for the identical condition (every Instagram
    // integration connected via native login instead of Facebook).
    titleKey: null,
    descriptionKey: "metaConversions.unsupportedExplanation",
    ctaKey: "metaConversions.connectViaFacebook",
    href: (workspaceId) =>
      `/channels/create?channel=instagram-facebook&workspaceId=${workspaceId}`,
  },
}

/**
 * Which empty state (if any) the tool page should render for a channel.
 * `null` means the channel has at least one eligible integration, so the
 * filter + box render instead. A channel-specific "unsupported" state takes
 * priority over the generic one when the channel reported unsupported
 * integrations AND defines such a state — pure, so it is unit-tested
 * without rendering (`__tests__/messaging-ads-tool-empty-state.test.ts`).
 */
export function resolveMessagingAdsToolEmptyState(input: {
  channel: MessagingAdChannel
  integrations: MessagingAdsToolIntegration[]
  hasUnsupportedIntegrations: boolean
}): MessagingAdsToolEmptyStateConfig | null {
  if (input.integrations.length > 0) {
    return null
  }
  const unsupportedState = input.hasUnsupportedIntegrations
    ? UNSUPPORTED_INTEGRATIONS_EMPTY_STATE[input.channel]
    : undefined
  return unsupportedState ?? NO_INTEGRATIONS_EMPTY_STATE
}
