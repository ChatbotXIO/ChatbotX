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
    enabled: z.boolean(),
    scheduleEnabled: z.boolean(),
    timeRanges: aiHandoverTimeRangesSchema,
    /** `null` clears the flow (the return message, if any, is sent instead). */
    gotoFlowId: zodBigintAsString().nullable(),
    returnMessage: z.string().max(AI_HANDOVER_MESSAGE_MAX_LENGTH),
    pauseBotWaitingForStaff: z.boolean(),
  })
  // A schedule without a window would never run: reject it at the form too.
  .refine((value) => !value.scheduleEnabled || value.timeRanges.length > 0, {
    path: ["timeRanges"],
  })
export type SaveAiHandoverSettingsRequest = z.infer<
  typeof saveAiHandoverSettingsRequest
>
