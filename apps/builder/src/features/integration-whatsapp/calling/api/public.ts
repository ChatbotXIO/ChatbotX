import { integrationWhatsappService } from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingWhatsappCalling,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  buildCallHoursFormValues,
  fromCallHoursSnapshot,
} from "../lib/call-hours"
import {
  ENGLISH_CALLING_MESSAGES,
  updateWhatsappCallHours,
  updateWhatsappCallingSettings,
} from "../lib/calling-operations"
import {
  type CallHoursIssue,
  callHoursFormSchema,
} from "../schemas/call-hours-schema"
import { updateWhatsappCallingSettingsSchema } from "../schemas/update-calling-settings-schema"

// Calling settings change what Meta bills (business-initiated calls are paid)
// and whether recordings of customer audio are made, so they sit under the
// `integrations` scope with the rest of the number's settings. The builder's
// super-admin gate is replaced by that scope.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

const channelIdParam = z.object({
  id: zodBigintAsString().describe(
    "WhatsApp channel (integration) id. Get it from `whatsappChannels.list`.",
  ),
})

const callingSettingsResource = z.object({
  callingEnabled: z
    .boolean()
    .nullable()
    .describe(
      "Local mirror of Meta's calling status; null means never mirrored (defers to Meta).",
    ),
  inboundCallsEnabled: z
    .boolean()
    .describe("Whether inbound calls ring agents."),
  callRecordingEnabled: z
    .boolean()
    .describe("Whether calls on this number are recorded."),
  callRecordingRetentionDays: z
    .number()
    .describe("Days a recording is kept before it is deleted."),
  callTranscriptionEnabled: z
    .boolean()
    .describe("Whether recordings are transcribed."),
  callHours: z
    .unknown()
    .describe("The weekly call-hours schedule mirrored from Meta, or null."),
  callHoursInput: callHoursFormSchema.describe(
    "The same schedule in the exact shape `whatsappChannels.updateCallHours` takes (7 days, minutes since midnight); a number with no schedule yet gets the builder default (weekdays 09:00-17:00, off). Change what you need and send it back.",
  ),
})

const updateCallingSettingsRequest = channelIdParam.extend({
  status: updateWhatsappCallingSettingsSchema.shape.status.describe(
    "Turn calling on or off at Meta (paid for business-initiated calls).",
  ),
  callIconVisibility:
    updateWhatsappCallingSettingsSchema.shape.callIconVisibility.describe(
      "Whether customers see the call button: DEFAULT or DISABLE_ALL.",
    ),
  callbackPermissionStatus:
    updateWhatsappCallingSettingsSchema.shape.callbackPermissionStatus.describe(
      "Whether customers may grant the business permission to call back.",
    ),
  recordingEnabled:
    updateWhatsappCallingSettingsSchema.shape.recordingEnabled.describe(
      "Record calls on this number (customer audio).",
    ),
  callRecordingRetentionDays:
    updateWhatsappCallingSettingsSchema.shape.callRecordingRetentionDays.describe(
      "Days to keep recordings, 1 to 3650.",
    ),
  callTranscriptionEnabled:
    updateWhatsappCallingSettingsSchema.shape.callTranscriptionEnabled.describe(
      "Transcribe recordings; needs recording on.",
    ),
  inboundCallsEnabled:
    updateWhatsappCallingSettingsSchema.shape.inboundCallsEnabled.describe(
      "Mute (false) or allow (true) inbound calls ringing agents.",
    ),
})

const updateCallHoursRequest = channelIdParam.extend({
  enabled: callHoursFormSchema.shape.enabled.describe(
    "Whether call hours restrict when calls are accepted.",
  ),
  timezoneId: callHoursFormSchema.shape.timezoneId.describe(
    "IANA timezone of the schedule, e.g. `Asia/Ho_Chi_Minh`.",
  ),
  days: callHoursFormSchema.shape.days.describe(
    "Exactly 7 entries MONDAY..SUNDAY in order, each with up to two ranges of {openMinute, closeMinute} (minutes since midnight, 0-1439). At least one range must be open.",
  ),
})

const CALL_HOURS_MESSAGES: Record<CallHoursIssue, string> = {
  rangeOrder: "A range must close after it opens.",
  rangeOverlap: "The two ranges of a day must not overlap.",
  noOpenHours: "At least one day needs an open range.",
}

const callHoursIssueMessage = (
  issue: { message: string; path: PropertyKey[] } | undefined,
): string => {
  if (!issue) {
    return "Invalid call hours"
  }
  const text =
    CALL_HOURS_MESSAGES[issue.message as CallHoursIssue] ?? issue.message
  return issue.path.length > 0 ? `${issue.path.join(".")}: ${text}` : text
}

const findIntegrationOrFail = async (workspaceId: string, id: string) => {
  const integration = await integrationWhatsappService.findWorkspaceIntegration(
    {
      id,
      workspaceId,
    },
  )
  if (!integration) {
    throw notFoundException("WhatsApp channel not found")
  }
  return integration
}

export const whatsappCallingPublicRouter = {
  getCallingSettings: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp-channels/{id}/calling",
      summary: "Get WhatsApp calling settings",
      description:
        "Returns the number's calling settings as stored here: calling and inbound switches, recording and transcription, retention and the weekly call hours. No call is made to Meta. Change them with `whatsappChannels.updateCallingSettings`, and the hours by sending `callHoursInput` (edited) to `whatsappChannels.updateCallHours`.",
      tags: ["Channels"],
    })
    .input(channelIdParam)
    .output(callingSettingsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const integration = await findIntegrationOrFail(
        context.workspace.id,
        input.id,
      )
      return callingSettingsResource.parse({
        ...integration,
        callHoursInput: buildCallHoursFormValues(
          integration.callHours
            ? fromCallHoursSnapshot(integration.callHours)
            : undefined,
          context.workspace.timezone,
        ),
      })
    }),

  updateCallingSettings: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/whatsapp-channels/{id}/calling",
      summary: "Update WhatsApp calling settings",
      description:
        "Changes the calling settings; only the fields you send change. `status`, `callIconVisibility` and `callbackPermissionStatus` are applied at Meta first (calling is paid, and recording stores customer audio); the local switches (recording, retention, transcription, inbound) are saved only after Meta accepted. A refusal returns Meta's own explanation.",
      successStatus: 204,
      tags: ["Channels"],
    })
    .input(updateCallingSettingsRequest)
    .errors(possibleErrorsOnUpdatingWhatsappCalling)
    .handler(async ({ context, input }) => {
      const { id, ...settings } = input
      await updateWhatsappCallingSettings({
        workspaceId: context.workspace.id,
        integrationWhatsappId: id,
        input: settings,
        messages: ENGLISH_CALLING_MESSAGES,
      })
    }),

  updateCallHours: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/whatsapp-channels/{id}/calling/hours",
      summary: "Set WhatsApp call hours",
      description:
        "Replaces the number's weekly call hours at Meta. Upcoming holiday schedules already at Meta are kept; past ones are dropped. Nothing is written if they cannot be read.",
      successStatus: 204,
      tags: ["Channels"],
    })
    .input(updateCallHoursRequest)
    .errors(possibleErrorsOnUpdatingWhatsappCalling)
    .handler(async ({ context, input }) => {
      const { id, ...hours } = input
      // Re-validated with the builder's schema (ranges, overlaps, open hours).
      const parsed = callHoursFormSchema.safeParse(hours)
      if (!parsed.success) {
        throw new ChatbotXException(
          callHoursIssueMessage(parsed.error.issues[0]),
          "validation",
          422,
        )
      }
      await updateWhatsappCallHours({
        workspaceId: context.workspace.id,
        integrationWhatsappId: id,
        input: parsed.data,
        messages: ENGLISH_CALLING_MESSAGES,
      })
    }),
}
