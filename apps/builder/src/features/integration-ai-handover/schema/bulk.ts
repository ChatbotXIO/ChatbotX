import {
  aiHandoverBulkActions,
  aiHandoverBulkStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { AI_HANDOVER_MESSAGE_MAX_LENGTH } from "./request"

/**
 * The "apply to all customers" switch of a Page: the state it is moved to and,
 * for OFF, the text sent with the HUMAN_AGENT tag.
 */
export const setApplyToAllRequest = z
  .object({
    applyToAllCustomers: z
      .boolean()
      .describe(
        "`true` hands every eligible customer thread to the AI; `false` takes them back.",
      ),
    message: z
      .string()
      .max(AI_HANDOVER_MESSAGE_MAX_LENGTH)
      .describe(
        "Text sent with the HUMAN_AGENT tag when taking customers back; required for `applyToAllCustomers: false`, ignored otherwise.",
      ),
  })
  // An OFF without text cannot be sent: reject it at the form too.
  .refine(
    (value) => value.applyToAllCustomers || value.message.trim().length > 0,
    { path: ["message"] },
  )
export type SetApplyToAllRequest = z.infer<typeof setApplyToAllRequest>

export const aiHandoverBulkRunResource = z.object({
  id: zodBigintAsString(),
  action: aiHandoverBulkActions,
  status: aiHandoverBulkStatuses,
  message: z.string().nullable(),
  requestedAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable(),
  finishedAt: z.coerce.date().nullable(),
  processedCount: z.number(),
  skippedCount: z.number(),
  failedCount: z.number(),
  /** An estimate while the run is live; the real sum once it ends. */
  totalCount: z.number().nullable(),
  currentError: z.string().nullable(),
  requestedByName: z.string().nullable(),
  /** Set while the run waits out the Page's rate limit (quota low). */
  pausedUntil: z.coerce.date().nullable(),
})
export type AiHandoverBulkRunResource = z.infer<
  typeof aiHandoverBulkRunResource
>

export const getApplyToAllStatusRequest = z.object({
  workspaceId: zodBigintAsString(),
  inboxId: zodBigintAsString(),
})

/**
 * `status` is the run's, kept top-level for the polling helper, plus two
 * states of the Page: `idle` (never switched) and `reconciling` (a change was
 * stored but its run does not exist yet).
 */
export const getApplyToAllStatusResponse = z.object({
  status: z.union([
    aiHandoverBulkStatuses,
    z.literal("idle"),
    z.literal("reconciling"),
  ]),
  applyToAllCustomers: z.boolean(),
  /** The saved automation is on and inside its schedule right now. */
  isAutomationActive: z.boolean(),
  run: aiHandoverBulkRunResource.nullable(),
})
export type GetApplyToAllStatusResponse = z.infer<
  typeof getApplyToAllStatusResponse
>

export const listAiHandoverBulkHistoryRequest = basePaginationRequest.extend({
  workspaceId: zodBigintAsString(),
  inboxId: zodBigintAsString(),
})

export const listAiHandoverBulkHistoryResponse = z.object({
  data: z.array(aiHandoverBulkRunResource),
  pageCount: z.number(),
})
export type ListAiHandoverBulkHistoryResponse = z.infer<
  typeof listAiHandoverBulkHistoryResponse
>
