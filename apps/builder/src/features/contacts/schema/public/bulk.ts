import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const MAX_BULK_CONTACT_IDS = 1000

export const bulkContactIdsPublicRequest = z.object({
  contactIds: z
    .array(zodBigintAsString())
    .min(1)
    .max(MAX_BULK_CONTACT_IDS)
    .describe(`Up to ${MAX_BULK_CONTACT_IDS} contact ids.`),
})
export type BulkContactIdsPublicRequest = z.infer<
  typeof bulkContactIdsPublicRequest
>

export const bulkAddTagsPublicRequest = bulkContactIdsPublicRequest.extend({
  tags: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(20)
    .describe(
      "Tag names — not ids. Existing tags whose name matches are reused; unmatched names are created.",
    ),
})
export type BulkAddTagsPublicRequest = z.infer<typeof bulkAddTagsPublicRequest>

export const bulkSubscribeSequencesPublicRequest =
  bulkContactIdsPublicRequest.extend({
    sequenceIds: z.array(zodBigintAsString()).min(1).max(20),
  })
export type BulkSubscribeSequencesPublicRequest = z.infer<
  typeof bulkSubscribeSequencesPublicRequest
>
