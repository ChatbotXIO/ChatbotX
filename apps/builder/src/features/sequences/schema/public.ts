import {
  sequenceStepContactResource,
  sequenceStepEventTypes,
} from "@chatbotx.io/analytics/schemas"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest } from "@/lib/public-api/list"

// `sequenceStepContactResource`/the analytics request schemas carry
// `workspaceId` (injected from the token's resolved workspace, never
// accepted from client input) and the response's `conversationId` (an
// internal builder-navigation detail, not a public API concern) — narrow
// variants declared here instead of reusing those directly, mirroring
// `broadcasts/schema/public.ts`.
export const publicListSequenceStepContactsRequest = z.object({
  id: zodBigintAsString().describe(
    "Sequence id. Get it from `sequences.list`.",
  ),
  stepId: zodBigintAsString().describe("Sequence step id."),
  eventType: sequenceStepEventTypes.describe(
    "Lifecycle event to filter recipients by (e.g. sent, opened).",
  ),
  page: publicListRequest.shape.page,
  perPage: publicListRequest.shape.perPage,
})

export const publicListSequenceStepContactsResponse = z.object({
  data: z.array(sequenceStepContactResource),
  total: z.number().int(),
  pageCount: z.number().int(),
})

export const listSequencesPublicRequest = publicListRequest.extend({
  name: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Case-insensitive substring match against the sequence name."),
  folderId: zodBigintAsString()
    .optional()
    .describe('Only sequences in this folder; "0" for sequences in no folder.'),
  active: z
    .boolean()
    .optional()
    .describe("Only active (true) or inactive (false) sequences."),
  sort: z
    .array(z.object({ id: z.string(), desc: z.boolean() }))
    .optional()
    .describe(
      "Sort order as [{ id, desc }] pairs, e.g. `createdAt`, `name`. Defaults to newest first.",
    ),
})
