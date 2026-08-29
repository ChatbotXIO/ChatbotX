export type CtwaRetargetSegment = "conversations" | "leads" | "purchases"

/**
 * Deep-links Ads Analytics' per-ad "Retarget → Send WhatsApp broadcast →
 * {segment}" into the broadcast create page with the WhatsApp channel +
 * integration preselected and the contact filter prefilled to exactly that
 * ad's segment + selected date range — the same recipient set as the
 * Facebook custom-audience path (`RetargetAudienceDialog`), resolved
 * server-side by the `ctwaRetarget` contact-filter condition.
 * `integrationWhatsappId` is carried BOTH inside the condition (to scope the
 * segment to that integration, matching the Facebook path) and as its own URL
 * param (to preselect the broadcast's sending integration).
 *
 * `channel: "whatsapp"` is ALWAYS set on the condition (not just when an
 * integration is selected) — fixes a correctness bug: `buildCtwaSegmentPredicate`
 * treats BOTH `channel` and `integrationWhatsappId` omitted as "any channel"
 * (the saved contact-filter's "no narrowing chosen" contract), so a
 * WhatsApp-labeled broadcast entry with no account selected (an "All
 * accounts" WhatsApp view, or any row reached via the "All channels"
 * aggregation) would otherwise silently match messenger/instagram
 * conversations too.
 */
export function buildWhatsappRetargetHref(input: {
  workspaceId: string
  segment: CtwaRetargetSegment
  adId?: string | null
  range: { from: string; to: string }
  integrationWhatsappId?: string | null
}): string {
  const contactFilter = {
    operator: "and" as const,
    conditions: [
      {
        field: "ctwaRetarget" as const,
        segment: input.segment,
        ...(input.adId ? { adId: input.adId } : {}),
        channel: "whatsapp" as const,
        ...(input.integrationWhatsappId
          ? { integrationWhatsappId: input.integrationWhatsappId }
          : {}),
        since: input.range.from,
        until: input.range.to,
      },
    ],
  }
  const params = new URLSearchParams({
    channel: "whatsapp",
    contactFilter: JSON.stringify(contactFilter),
  })
  if (input.integrationWhatsappId) {
    params.set("integrationWhatsappId", input.integrationWhatsappId)
  }
  return `/space/${input.workspaceId}/broadcasts/create?${params.toString()}`
}
