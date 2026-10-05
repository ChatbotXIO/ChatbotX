import { aiHandoverTimeRangesSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { AI_HANDOVER_CHANNEL_POLICIES } from "@chatbotx.io/utils/channel"
import { z } from "zod"

/**
 * The loosest text limit any channel allows. The form only guards against
 * absurd input; the server enforces the Page's own channel limit.
 */
export const AI_HANDOVER_MESSAGE_MAX_LENGTH = Math.max(
  ...Object.values(AI_HANDOVER_CHANNEL_POLICIES).map(
    (policy) => policy.messageMaxLength,
  ),
)

export const saveAiHandoverSettingsRequest = z
  .object({
    enabled: z
      .boolean()
      .describe("Master switch of the AI hand-off automation."),
    scheduleEnabled: z
      .boolean()
      .describe("Whether `timeRanges` bound when the automation runs."),
    timeRanges: aiHandoverTimeRangesSchema.describe(
      "Hours of the workspace timezone when the automation runs; required when `scheduleEnabled`, otherwise an empty list.",
    ),
    /** `null` clears the flow (the return message, if any, is sent instead). */
    gotoFlowId: zodBigintAsString()
      .nullable()
      .describe(
        "Flow started when the AI hands the conversation back, or null to send `returnMessage` instead.",
      ),
    returnMessage: z
      .string()
      .max(AI_HANDOVER_MESSAGE_MAX_LENGTH)
      .describe(
        "Message sent when no flow is set or it is no longer active; empty for none.",
      ),
    pauseBotWaitingForStaff: z
      .boolean()
      .describe("Pause the bot for the contact after the hand-back."),
  })
  // A schedule without a window would never run: reject it at the form too.
  .refine((value) => !value.scheduleEnabled || value.timeRanges.length > 0, {
    path: ["timeRanges"],
  })
export type SaveAiHandoverSettingsRequest = z.infer<
  typeof saveAiHandoverSettingsRequest
>
