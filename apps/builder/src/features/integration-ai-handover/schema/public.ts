import { aiHandoverTimeRangesSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicListRequest } from "@/lib/public-api/list"
import { aiHandoverBulkRunResource, getApplyToAllStatusResponse } from "./bulk"
import { AI_HANDOVER_MESSAGE_MAX_LENGTH } from "./request"

export const aiHandoverInboxIdParam = z.object({
  inboxId: zodBigintAsString().describe(
    "Inbox id of the Page. Get it from `inboxes.list`.",
  ),
})

export const aiHandoverSettingsResource = z.object({
  enabled: z.boolean().describe("Master switch of the AI hand-off automation."),
  scheduleEnabled: z
    .boolean()
    .describe("Whether `timeRanges` bound when the automation runs."),
  timeRanges: aiHandoverTimeRangesSchema.describe(
    "Hours of the workspace timezone when the automation runs; required when `scheduleEnabled`. Saved ranges are kept when `scheduleEnabled` is false and only apply while it is true.",
  ),
  gotoFlowId: zodBigintAsString()
    .nullable()
    .describe("Flow started when the AI hands the conversation back."),
  returnMessage: z
    .string()
    .nullable()
    .describe("Message sent when no flow is set or it is no longer active."),
  pauseBotWaitingForStaff: z
    .boolean()
    .describe("Pause the bot for the contact after the hand-back."),
})

const returnMessageInput = z
  .string()
  .max(AI_HANDOVER_MESSAGE_MAX_LENGTH)
  .nullable()
  .describe(
    "Message sent when no flow is set or it is no longer active; null or empty for none.",
  )

// Own object (not the UI form schema) so a GET result can be sent back to PUT
// (`returnMessage` is null there) and `message` can be omitted for an ON.
export const saveAiHandoverSettingsPublicRequest = aiHandoverSettingsResource
  .extend({ returnMessage: returnMessageInput })
  .and(aiHandoverInboxIdParam)
  .refine((value) => !value.scheduleEnabled || value.timeRanges.length > 0, {
    path: ["timeRanges"],
    message: "A schedule needs at least one time range",
  })

/** Only the fields to change; the others keep their saved value. */
export const patchAiHandoverSettingsPublicRequest = aiHandoverSettingsResource
  .extend({ returnMessage: returnMessageInput })
  .partial()
  .and(aiHandoverInboxIdParam)

export const setApplyToAllPublicRequest = z
  .object({
    applyToAllCustomers: z
      .boolean()
      .describe(
        "`true` hands every eligible customer thread to the AI; `false` takes them back.",
      ),
    message: z
      .string()
      .max(AI_HANDOVER_MESSAGE_MAX_LENGTH)
      .optional()
      .describe(
        "Text sent with the HUMAN_AGENT tag when taking customers back; required for `applyToAllCustomers: false`, omit it otherwise.",
      ),
    dryRun: z
      .boolean()
      .optional()
      .describe(
        "Only count the customers the change would touch; nothing is changed or sent.",
      ),
    confirmCount: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Required unless `dryRun`: the most customers you accept being handed over or taken back. The call is refused when more are eligible at that moment, or when the change cannot start immediately. It is a check at request time, not a cap on the run: customers who become eligible while it progresses are still included. Run `dryRun` first and pass its `eligibleCount`.",
      ),
  })
  .and(aiHandoverInboxIdParam)
  .refine(
    (value) => value.applyToAllCustomers || (value.message ?? "").trim() !== "",
    {
      path: ["message"],
      message: "message is required to take customers back",
    },
  )
  .refine(
    (value) => value.dryRun === true || value.confirmCount !== undefined,
    {
      path: ["confirmCount"],
      message: "confirmCount is required unless dryRun is true",
    },
  )

export const setApplyToAllPublicResponse = z.object({
  dryRun: z.boolean().describe("True when nothing was changed."),
  isChanged: z
    .boolean()
    .describe("False when the Page already was in the requested state."),
  eligibleCount: z
    .number()
    .nullable()
    .describe(
      "Customers the change touches, as counted for a `dryRun`; null when it was applied.",
    ),
  run: aiHandoverBulkRunResource
    .nullable()
    .describe("The run started by the change, when one was created."),
})

export const applyToAllStatusPublicResponse = getApplyToAllStatusResponse

export const aiHandoverSettingsWithStatusResource =
  aiHandoverSettingsResource.extend({
    applyToAll: applyToAllStatusPublicResponse.describe(
      "Whether every customer is handed to the AI, whether the automation runs now, and the latest apply-to-all run.",
    ),
  })

export const listAiHandoverHistoryPublicRequest = publicListRequest.and(
  aiHandoverInboxIdParam,
)
