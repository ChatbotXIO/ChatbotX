import { channelTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schemas"

/**
 * Deep-link prefill for the broadcast create page — used by Ads Analytics'
 * per-ad "Retarget → Send WhatsApp broadcast → {segment}" action to land the
 * user on a broadcast with the WhatsApp channel + integration preselected and
 * the contact filter prefilled to that ad's exact segment (see
 * `ads-analytics-view.tsx`'s deep-link builder). Mirrors the
 * `?contactFilter=<JSON>` round-trip already used by the contacts page.
 */
const parseContactFilterSearchParam = (value: unknown) => {
  if (typeof value !== "string") {
    return
  }

  try {
    const parsed = contactFilterCriteriaSchema.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : undefined
  } catch {
    return
  }
}

export const createBroadcastPrefillSchema = z.object({
  channel: channelTypes.optional(),
  integrationWhatsappId: zodBigintAsString().optional(),
  contactFilter: z.preprocess(
    parseContactFilterSearchParam,
    contactFilterCriteriaSchema.optional(),
  ),
})
export type CreateBroadcastPrefill = z.infer<
  typeof createBroadcastPrefillSchema
>

export function parseCreateBroadcastPrefill(
  searchParams: Record<string, unknown>,
): CreateBroadcastPrefill {
  const { data } = createBroadcastPrefillSchema.safeParse(searchParams)
  return data ?? {}
}
