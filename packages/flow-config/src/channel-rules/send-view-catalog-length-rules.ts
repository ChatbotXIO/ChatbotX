import { channelTypes } from "@chatbotx.io/utils/channel"
import { CHANNEL_FLOW_POLICIES } from "./policies"

export type SendViewCatalogLengthLimits = {
  footer: number
  text: number
}

const declaredLimits = Object.values(CHANNEL_FLOW_POLICIES).flatMap((policy) =>
  policy.limits.viewCatalog ? [policy.limits.viewCatalog] : [],
)

/**
 * The widest limit any channel delivering `sendViewCatalog` accepts. The step
 * schema has no channel to check, so it caps here; a channel with a narrower
 * limit adds its own refinement the way `sendText` does.
 *
 * These count UTF-16 units (`String.length`), not code points like
 * `countMessageCharacters`: the senders' constructors and `clampText` measure
 * UTF-16, so a code-point count would let 1,026 units of emoji through and have
 * the sender cut them mid-character.
 */
export const SEND_VIEW_CATALOG_TEXT_MAX = Math.max(
  ...declaredLimits.map((limits) => limits.text),
)
export const SEND_VIEW_CATALOG_FOOTER_MAX = Math.max(
  ...declaredLimits.map((limits) => limits.footer),
)

export const resolveSendViewCatalogLengthLimits = (
  channel: string | null | undefined,
): SendViewCatalogLengthLimits => {
  const parsed = channelTypes.safeParse(channel)
  const declared = parsed.success
    ? CHANNEL_FLOW_POLICIES[parsed.data].limits.viewCatalog
    : undefined

  return (
    declared ?? {
      footer: SEND_VIEW_CATALOG_FOOTER_MAX,
      text: SEND_VIEW_CATALOG_TEXT_MAX,
    }
  )
}
