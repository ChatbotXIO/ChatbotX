import {
  buildContext,
  integrationWhatsappService,
  WhatsappCallTranscriptionRequiresRecordingError,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  getCallingSettings,
  type WhatsappCallingSettings,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { integrations } from "@/integration"
import { logger } from "@/lib/log"
import { throwWhatsappApiActionError } from "../../libs/whatsapp-api-action-error"
import type { CallHoursFormValues } from "../schemas/call-hours-schema"
import type { UpdateWhatsappCallingSettingsSchema } from "../schemas/update-calling-settings-schema"
import {
  toCallHoursSnapshot,
  toMetaCallHours,
  upcomingHolidays,
} from "./call-hours"
import { invalidateCallingSettingsCache } from "./calling-settings-cache"

// The calling-settings operations behind both the builder actions and the
// public API. Authorization (a super admin in the builder, the `integrations`
// scope for a token) and the wording of errors stay with the caller.

export type CallingMessages = {
  notFound: string
  transcriptionRequiresRecording: string
  updateFailed: string
  /** Meta accepted the change but the local mirror write failed. */
  savedOnMetaOnly: string
}

/** Meta (or the local mirror after Meta accepted) failed: a retryable 502, not a 4xx. */
export const WHATSAPP_CALLING_UPSTREAM_CODE = "whatsappCallingUpstream"

export const ENGLISH_CALLING_MESSAGES: CallingMessages = {
  notFound: "WhatsApp channel not found",
  transcriptionRequiresRecording:
    "Turn on call recording before turning on transcription.",
  updateFailed: "Meta did not accept the calling settings.",
  savedOnMetaOnly:
    "Meta accepted the change but it could not be saved here. Send the same request again to fix it.",
}

const findIntegration = async (
  workspaceId: string,
  integrationWhatsappId: string,
  messages: CallingMessages,
) => {
  const integrationWhatsapp =
    await integrationWhatsappService.findWorkspaceIntegration({
      id: integrationWhatsappId,
      workspaceId,
    })
  if (!integrationWhatsapp) {
    throw new ChatbotXException(messages.notFound, "notFound", 404)
  }
  return integrationWhatsapp
}

type CallingIntegration = Awaited<ReturnType<typeof findIntegration>>

const buildCallingContext = (
  workspaceId: string,
  integrationWhatsapp: CallingIntegration,
) =>
  buildContext({
    workspaceId,
    integrationType: "whatsapp",
    integration: {
      ...integrationWhatsapp,
      auth: integrationWhatsapp.auth as WhatsappAuthValue,
    },
  })

/**
 * Saves the calling toggles: the Meta-side ones (`status`, icon visibility,
 * callback permission) go to Meta first, the local ones (recording,
 * transcription, inbound) are mirrored in ONE write only once the whole save is
 * known to have succeeded, so the database never says one thing while Meta says
 * another.
 */
export async function updateWhatsappCallingSettings(props: {
  workspaceId: string
  integrationWhatsappId: string
  input: UpdateWhatsappCallingSettingsSchema
  messages: CallingMessages
}): Promise<void> {
  const {
    workspaceId,
    integrationWhatsappId,
    input: parsedInput,
    messages,
  } = props
  const integrationWhatsapp = await findIntegration(
    workspaceId,
    integrationWhatsappId,
    messages,
  )
  const data: Partial<WhatsappCallingSettings> = {}
  if (parsedInput.status) {
    data.status = parsedInput.status
  }
  if (parsedInput.callIconVisibility) {
    data.call_icon_visibility = parsedInput.callIconVisibility
  }
  if (parsedInput.callbackPermissionStatus) {
    data.callback_permission_status = parsedInput.callbackPermissionStatus
  }
  const localValues: Partial<{
    callRecordingEnabled: boolean
    callRecordingRetentionDays: number
    callTranscriptionEnabled: boolean
    inboundCallsEnabled: boolean
    callingEnabled: boolean
  }> = {}
  if (parsedInput.recordingEnabled !== undefined) {
    localValues.callRecordingEnabled = parsedInput.recordingEnabled
  }
  if (parsedInput.callRecordingRetentionDays !== undefined) {
    localValues.callRecordingRetentionDays =
      parsedInput.callRecordingRetentionDays
  }
  if (parsedInput.callTranscriptionEnabled !== undefined) {
    localValues.callTranscriptionEnabled = parsedInput.callTranscriptionEnabled
  }
  if (parsedInput.inboundCallsEnabled !== undefined) {
    localValues.inboundCallsEnabled = parsedInput.inboundCallsEnabled
  }
  const persist = async (values: typeof localValues) => {
    try {
      await integrationWhatsappService.updateCallSettings({
        id: integrationWhatsappId,
        workspaceId,
        values,
      })
    } catch (error) {
      if (error instanceof WhatsappCallTranscriptionRequiresRecordingError) {
        throw new ChatbotXException(messages.transcriptionRequiresRecording)
      }
      throw error
    }
  }
  // A pure local toggle needs no Meta round-trip.
  if (Object.keys(data).length === 0) {
    await persist(localValues)
    return
  }
  const ctx = await buildCallingContext(workspaceId, integrationWhatsapp)
  try {
    await integrations.whatsapp.runAction("updateCallingSettings", {
      ctx,
      data,
    })
  } catch (error) {
    // Meta explains the refusal (messaging tier too low, coexistence number, ...)
    // in `error_user_msg` — surface that instead of a label.
    throwWhatsappApiActionError(error, messages.updateFailed)
  }
  // Everything below runs ONLY after Meta accepted the change. Writing the
  // mirror first would let a refused update leave the number reporting calling
  // as on while Meta still has it off — and the inbound gate reads the mirror.
  try {
    await persist(
      parsedInput.status
        ? { ...localValues, callingEnabled: parsedInput.status === "ENABLED" }
        : localValues,
    )
  } catch (error) {
    if (error instanceof ChatbotXException) {
      throw error
    }
    logger.error(
      { err: error, workspaceId, integrationWhatsappId },
      "Whatsapp calling: Meta accepted the settings but the local mirror write failed",
    )
    throw new ChatbotXException(
      messages.savedOnMetaOnly,
      WHATSAPP_CALLING_UPSTREAM_CODE,
      502,
    )
  }
  // The inbox reads these settings through a cache.
  await invalidateCallingSettingsCache(integrationWhatsappId)
}

/**
 * Saves a number's weekly call hours on Meta. Meta replaces call_hours
 * wholesale and deletes any holiday schedule the request leaves out, so the
 * current holidays are read from Meta at save time and sent back, minus the
 * ones already past. If they can't be read, nothing is written.
 */
export async function updateWhatsappCallHours(props: {
  workspaceId: string
  integrationWhatsappId: string
  input: CallHoursFormValues
  messages: CallingMessages
}): Promise<void> {
  const {
    workspaceId,
    integrationWhatsappId,
    input: parsedInput,
    messages,
  } = props
  const integrationWhatsapp = await findIntegration(
    workspaceId,
    integrationWhatsappId,
    messages,
  )
  const auth = integrationWhatsapp.auth as WhatsappAuthValue

  let current: WhatsappCallingSettings
  try {
    current = await getCallingSettings(auth)
  } catch {
    throw new ChatbotXException(
      messages.updateFailed,
      WHATSAPP_CALLING_UPSTREAM_CODE,
      502,
    )
  }
  const callHours = toMetaCallHours(
    parsedInput,
    upcomingHolidays(
      current.call_hours?.holiday_schedule,
      parsedInput.timezoneId,
    ),
  )
  const ctx = await buildCallingContext(workspaceId, integrationWhatsapp)
  try {
    await integrations.whatsapp.runAction("updateCallingSettings", {
      ctx,
      data: { call_hours: callHours },
    })
  } catch (error) {
    throwWhatsappApiActionError(error, messages.updateFailed)
  }
  // Mirrored only after Meta accepted the schedule, so the inbound gate can
  // never refuse a call on hours Meta never stored.
  try {
    await integrationWhatsappService.updateCallSettings({
      id: integrationWhatsappId,
      workspaceId,
      values: { callHours: toCallHoursSnapshot(callHours) },
    })
  } catch (error) {
    logger.error(
      { err: error, workspaceId, integrationWhatsappId },
      "Whatsapp calling: Meta accepted the call hours but the local mirror write failed",
    )
    throw new ChatbotXException(
      messages.savedOnMetaOnly,
      WHATSAPP_CALLING_UPSTREAM_CODE,
      502,
    )
  }
  await invalidateCallingSettingsCache(integrationWhatsappId)
}
