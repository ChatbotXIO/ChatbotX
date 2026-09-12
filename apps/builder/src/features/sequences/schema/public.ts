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
  id: zodBigintAsString(),
  stepId: zodBigintAsString(),
  eventType: sequenceStepEventTypes,
  page: publicListRequest.shape.page,
  perPage: publicListRequest.shape.perPage,
})

export const publicListSequenceStepContactsResponse = z.object({
  data: z.array(sequenceStepContactResource),
  total: z.number().int(),
  pageCount: z.number().int(),
})
