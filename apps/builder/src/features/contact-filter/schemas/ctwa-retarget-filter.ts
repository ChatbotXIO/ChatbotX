import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { MAX_ADS_ANALYTICS_RANGE_DAYS } from "@/features/ads/schemas/analytics"

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 24 * 60 * 60 * 1000

export const ctwaRetargetSegments = z.enum([
  "conversations",
  "leads",
  "purchases",
])
export type CtwaRetargetSegment = z.infer<typeof ctwaRetargetSegments>

/**
 * Machine-generated "CTWA retarget" condition — deep-linked from Ads
 * Analytics' per-ad Retarget menu into the broadcast create page's contact
 * filter, so the broadcast targets the exact same segment + date range as
 * the Facebook custom-audience export path. Modeled on
 * `couponTopicConditionSchema`: a bespoke, no-operator discriminated branch
 * carrying its own params instead of the generic `{field,operator,value}`
 * shape (`staticFieldFilter`). Never surfaced in the "add condition" picker
 * (no entry in `CONTACT_FILTER_FIELD_DEFINITIONS`) — resolved server-side by
 * `buildCtwaSegmentContactExists`.
 */
export const ctwaRetargetConditionSchema = z
  .object({
    field: z.literal("ctwaRetarget"),
    segment: ctwaRetargetSegments,
    adId: z.string().trim().min(1).optional(),
    // Scopes the segment to one WhatsApp integration, matching the Facebook
    // path. Safe to accept from the client: the resolved SQL is workspace-
    // scoped, so a foreign integration id matches nothing.
    integrationWhatsappId: zodBigintAsString().optional(),
    since: z.string().regex(DATE_KEY_PATTERN, "Expected YYYY-MM-DD"),
    until: z.string().regex(DATE_KEY_PATTERN, "Expected YYYY-MM-DD"),
  })
  .superRefine((condition, ctx) => {
    const since = new Date(`${condition.since}T00:00:00.000Z`)
    const until = new Date(`${condition.until}T23:59:59.999Z`)

    if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid date",
        path: ["since"],
      })
      return
    }

    if (since.getTime() > until.getTime()) {
      ctx.addIssue({
        code: "custom",
        message: "since must not be after until",
        path: ["until"],
      })
      return
    }

    const rangeDays = (until.getTime() - since.getTime()) / MS_PER_DAY
    if (rangeDays > MAX_ADS_ANALYTICS_RANGE_DAYS) {
      ctx.addIssue({
        code: "custom",
        message: "Date range exceeds the maximum allowed",
        path: ["until"],
      })
    }
  })

export type CtwaRetargetCondition = z.infer<typeof ctwaRetargetConditionSchema>
