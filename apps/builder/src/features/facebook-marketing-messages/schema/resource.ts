import { z } from "zod"
import { mmContentSchema } from "./content"

export const MM_NAME_MAX = 120

const budgetTypeSchema = z.enum(["daily", "lifetime"])

/**
 * The fields both create and edit accept. Shared so a constraint change (e.g.
 * a tighter budget rule) cannot land on one path and drift on the other.
 *
 * Budget is entered in MAJOR units and validated only as `> 0` — Meta's
 * per-currency minimum is enforced by Meta on save, not here. The conversion
 * to minor units happens in `buildCampaignBudget`, which also records the
 * offset so the stored amount stays auditable.
 */
const marketingMessageFieldsSchema = z.object({
  name: z.string().trim().min(1).max(MM_NAME_MAX),
  budgetType: budgetTypeSchema,
  budgetMajorUnits: z.coerce.number().positive(),
  content: mmContentSchema,
})

export const createMarketingMessageSchema = marketingMessageFieldsSchema.extend(
  {
    pageId: z.string().trim().min(1),
    adAccountId: z.string().trim().min(1),
    currency: z.string().trim().min(1),
  },
)
export type CreateMarketingMessageInput = z.infer<
  typeof createMarketingMessageSchema
>

/**
 * `adAccountId`, `pageId` and `currency` are frozen after creation — changing
 * the account or Page means a different Meta campaign, not an edit of this
 * one — so they are absent here.
 *
 * `budgetType` is frozen too, for a different reason: the budget lives on the
 * ad set, and switching daily → lifetime there requires an `end_time` (Meta:
 * "a lifetime budget requires an end date for the schedule") that this form
 * never collects. Only the amount is editable; the type is read from the
 * stored row.
 */
export const updateMarketingMessageSchema = marketingMessageFieldsSchema.omit({
  budgetType: true,
})
export type UpdateMarketingMessageInput = z.infer<
  typeof updateMarketingMessageSchema
>
