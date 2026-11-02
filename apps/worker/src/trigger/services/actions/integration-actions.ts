import {
  contactInboxService,
  googleAdsConversionService,
  metaConversionsService,
} from "@chatbotx.io/business"
import { metaCapiEventChannelSchema } from "@chatbotx.io/database/schema"
import {
  errorStateDefaultFn,
  googleAdsConversionFieldsSchema,
  metaCapiEventFieldsSchema,
  type SpreadsheetClearRowSchema,
  type SpreadsheetColumnFilterSchema,
  type SpreadsheetContactToSheetMappingSchema,
  type SpreadsheetGetRandomRowSchema,
  type SpreadsheetGetRowSchema,
  type SpreadsheetSendDataSchema,
  type SpreadsheetSheetToContactMappingSchema,
  type SpreadsheetUpdateRowSchema,
  type StepType,
  spreadsheetStepVersions,
  stepTypes,
  successStateDefaultFn,
  withGoogleAdsConversionRefinements,
  withMetaCapiEventRefinements,
} from "@chatbotx.io/flow-config"
import { sanitizeGoogleAdsError } from "@chatbotx.io/integration-google-ads"
import baseLogger from "@chatbotx.io/logger"
import { createId } from "@chatbotx.io/utils"
import {
  googleAdsConversionErrorCodes,
  hasGoogleClick,
} from "@chatbotx.io/utils/google-click"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"
import type { ExecuteStepProps } from "../../../integration/handlers/flow"
import {
  configRefusalCodes,
  describeGoogleAdsConsentFailure,
  describeGoogleAdsInputFailure,
  isConfigRefusal,
  reportGoogleAdsInputFailure,
} from "../../../integration/handlers/google-ads/google-ads-input-error"
import { resolveGoogleAdsConversionInputs } from "../../../integration/handlers/google-ads/resolve-conversion-inputs"
import {
  describeCapiInputValidationError,
  enqueueCapiEvent,
  reportCapiInputFailure,
} from "../../../integration/handlers/meta-conversions/capi-input-error"
import {
  clearSpreadsheetRow,
  getSpreadsheetRandomRow,
  getSpreadsheetRow,
  sendSpreadsheetData,
  updateSpreadsheetRow,
} from "../../../integration/handlers/spreadsheet-handler"
import { skipped, succeeded, type TriggerActionHandler } from "./types"

// The trigger action's stored shape is validated with the same field-set
// schema the flow step and the builder trigger-action form use,
// layered with the exact same cross-field refinements the flow step's
// `sendMetaCapiEventSchema` applies (Purchase requires value+currency; the
// event name must belong to the action source's catalog) — so an invalid
// stored/edited action is caught here, before `enqueueEvent` is ever called,
// not surfaced as a business-layer `ZodError` deep inside it.
const metaCapiTriggerActionSchema = withMetaCapiEventRefinements(
  metaCapiEventFieldsSchema,
)

// Same idea for `sendGoogleAdsConversion`: the stored action is validated
// with the flow step's field set and cross-field rule before `record` runs.
const googleAdsTriggerActionSchema = withGoogleAdsConversionRefinements(
  googleAdsConversionFieldsSchema,
)

export const sendMetaCapiEvent: TriggerActionHandler = async ({
  context,
  scope,
  conversation,
}) => {
  const { action, contactId, source, workspaceId } = context
  const { getContactInbox } = scope
  // Its dedup source key is scoped to a trigger.
  if (source.kind !== "trigger") {
    return skipped("unsupportedSource")
  }
  const { triggerId } = source
  const contactInbox = await getContactInbox()
  if (!contactInbox) {
    baseLogger.warn(
      `No contact inbox found for contact ${contactId}, skipping sendMetaCapiEvent action`,
    )
    return skipped("noContactInbox")
  }

  const capiChannel = metaCapiEventChannelSchema.safeParse(contactInbox.channel)
  if (!capiChannel.success) {
    baseLogger.warn(
      `Unsupported Meta CAPI trigger channel: ${contactInbox.channel}`,
    )
    return skipped("unsupportedChannel")
  }

  const parsedAction = metaCapiTriggerActionSchema.safeParse(action)
  if (!parsedAction.success) {
    const detail = describeCapiInputValidationError(parsedAction.error)
    baseLogger.warn(
      `Invalid Meta CAPI trigger action for trigger ${triggerId}: ${detail}`,
    )
    await reportCapiInputFailure({
      workspaceId,
      contactId,
      sourceId: contactInbox.sourceId,
      message: `Invalid Meta CAPI trigger action (trigger ${triggerId}):\n${detail}`,
    })
    return skipped("invalidAction")
  }

  // Trigger executor passes `contactInbox.id` (a string), not the full
  // model — `getContactInbox()` returns a narrow
  // `ContactInboxWorkspaceRow` (id/channel/inboxId/sourceId only), not a
  // `ContactInboxModel`.
  const resolvedFields = await resolveContactVariablesDeep(
    contactId,
    {
      value: parsedAction.data.value,
      currency: parsedAction.data.currency,
      contentIds: parsedAction.data.contentIds,
    },
    { contactInbox: contactInbox.id, conversation },
  )

  await enqueueCapiEvent(
    {
      workspaceId,
      channel: capiChannel.data,
      contactInboxId: contactInbox.id,
      inboxId: contactInbox.inboxId,
      source: "triggerAction",
      sourceKey: metaConversionsService.buildSourceKey({
        scope: "trigger",
        scopeId: triggerId,
        contactInboxId: contactInbox.id,
        channel: capiChannel.data,
        actionSource: parsedAction.data.actionSource,
      }),
      eventName: parsedAction.data.eventName,
      actionSource: parsedAction.data.actionSource,
      contentType: parsedAction.data.contentType,
      contentIds: resolvedFields.contentIds,
      value: resolvedFields.value,
      currency: resolvedFields.currency,
      contentCategory: parsedAction.data.contentCategory,
      contentName: parsedAction.data.contentName,
    },
    {
      contactId,
      sourceId: contactInbox.sourceId,
      resolved: resolvedFields,
    },
  )
  return succeeded
}

export const sendGoogleAdsConversion: TriggerActionHandler = async ({
  context,
  scope,
  conversation,
}) => {
  const { action, contactId, source, workspaceId } = context
  const { getContactInbox } = scope
  // Its dedup scope is a trigger.
  if (source.kind !== "trigger") {
    return skipped("unsupportedSource")
  }
  const { triggerId } = source
  // Prefer the threaded/most-recent inbox when it carries a Google
  // click; otherwise fall back to the contact's latest clicked inbox
  // (the attributable inbox is not necessarily the most recently active
  // one, e.g. the click came in on WhatsApp, the trigger on Messenger).
  const resolvedInbox = await getContactInbox()
  const resolvedClick = resolvedInbox
    ? await contactInboxService.findGoogleClickAttribution({
        workspaceId,
        contactInboxId: resolvedInbox.id,
      })
    : null
  const clickInbox = hasGoogleClick(resolvedClick?.referral)
    ? resolvedClick
    : await contactInboxService.findLatestGoogleClickInboxByContact({
        workspaceId,
        contactId,
      })
  if (!clickInbox) {
    baseLogger.warn(
      `No contact inbox with a Google click for contact ${contactId}, skipping sendGoogleAdsConversion action`,
    )
    return skipped("noGoogleClick")
  }

  const parsedAction = googleAdsTriggerActionSchema.safeParse(action)
  if (!parsedAction.success) {
    const detail = describeGoogleAdsInputFailure(
      googleAdsConversionErrorCodes.invalidInput,
      {},
      parsedAction.error,
    )
    baseLogger.warn(
      `Invalid Google Ads trigger action for trigger ${triggerId}: ${detail}`,
    )
    await reportGoogleAdsInputFailure({
      workspaceId,
      contactId,
      sourceId: clickInbox.sourceId,
      message: `${detail}\nTrigger: ${triggerId}`,
    })
    return skipped("invalidAction")
  }

  const resolved = await resolveGoogleAdsConversionInputs({
    workspaceId,
    contactId,
    fields: {
      value: parsedAction.data.value,
      currency: parsedAction.data.currency,
      dedupMode: parsedAction.data.dedupMode,
      dedupId: parsedAction.data.dedupId,
      conversionTime: parsedAction.data.conversionTime,
      customerType: parsedAction.data.customerType,
      customerValueBucket: parsedAction.data.customerValueBucket,
    },
    source: { contactInbox: clickInbox.id, conversation },
  })
  if (!resolved.ok) {
    const detail = describeGoogleAdsConsentFailure(
      resolved.code,
      resolved.setting,
    )
    baseLogger.warn(
      `Google Ads conversion not recorded for trigger ${triggerId}: ${detail}`,
    )
    await reportGoogleAdsInputFailure({
      workspaceId,
      contactId,
      sourceId: clickInbox.sourceId,
      message: `${detail}\nTrigger: ${triggerId}`,
    })
    return skipped("configRefused")
  }
  const { dedupMode, fields, recordFields } = resolved.inputs

  let outcome: Awaited<ReturnType<typeof googleAdsConversionService.record>>
  try {
    outcome = await googleAdsConversionService.record({
      workspaceId,
      contactInboxId: clickInbox.id,
      source: "triggerAction",
      scopeId: triggerId,
      conversionActionId: parsedAction.data.conversionActionId,
      ...recordFields,
      // Only `event` dedup reads it. The contact (not the click inbox,
      // which is re-picked on every attempt and can move to a newer
      // click) keeps the key identical when the same job is replayed.
      occurrenceKey:
        dedupMode === "event" && context.occurrenceKey
          ? `${context.occurrenceKey}:${contactId}`
          : undefined,
      matchEmail: parsedAction.data.matchEmail,
      matchPhone: parsedAction.data.matchPhone,
    })
  } catch (error) {
    // Message only: the raw error may carry bound parameters (click id).
    baseLogger.error(
      `Failed to record Google Ads conversion for trigger ${triggerId}: ${sanitizeGoogleAdsError(error).message}`,
    )
    return skipped("recordFailed")
  }

  if (outcome.status === "queued") {
    return succeeded
  }
  baseLogger.warn(
    `Google Ads conversion not recorded for trigger ${triggerId}: ${outcome.status}`,
  )
  if (isConfigRefusal(outcome.status)) {
    await reportGoogleAdsInputFailure({
      workspaceId,
      contactId,
      sourceId: clickInbox.sourceId,
      message: `${describeGoogleAdsInputFailure(
        configRefusalCodes[outcome.status],
        fields,
      )}\nTrigger: ${triggerId}`,
    })
  }
  return skipped(outcome.status)
}

export const runGoogleSheet: TriggerActionHandler = async ({
  context,
  scope,
  conversation,
}) => {
  const { action, contactId, source } = context
  const { getContactInbox } = scope
  // Spreadsheet runs are a trigger-only action today.
  if (source.kind !== "trigger") {
    return skipped("unsupportedSource")
  }
  const contactInbox = await getContactInbox()
  if (!contactInbox) {
    baseLogger.warn(
      `No contact inbox found for contact ${contactId}, skipping runGoogleSheet action`,
    )
    return skipped("noContactInbox")
  }

  const spreadsheetAction = action.action as StepType
  const spreadsheetId = action.spreadsheetId as string
  const sheetName = action.sheetName as string
  const lookup = action.lookup as SpreadsheetColumnFilterSchema
  const map = action.map ?? []

  const baseProps = {
    conversation,
    contactInbox,
  } as unknown as Omit<ExecuteStepProps<SpreadsheetGetRowSchema>, "step">

  switch (spreadsheetAction) {
    case stepTypes.enum.spreadsheetGetRow: {
      const step: SpreadsheetGetRowSchema = {
        id: createId(),
        stepType: stepTypes.enum.spreadsheetGetRow,
        spreadsheetId,
        sheetName,
        lookup,
        map: map as SpreadsheetSheetToContactMappingSchema[],
        states: [successStateDefaultFn(), errorStateDefaultFn()],
      }
      await getSpreadsheetRow({ ...baseProps, step })
      break
    }

    case stepTypes.enum.spreadsheetClearRow: {
      const step: SpreadsheetClearRowSchema = {
        id: createId(),
        stepType: stepTypes.enum.spreadsheetClearRow,
        spreadsheetId,
        sheetName,
        lookup,
        states: [successStateDefaultFn(), errorStateDefaultFn()],
      }
      await clearSpreadsheetRow({ ...baseProps, step })
      break
    }

    case stepTypes.enum.spreadsheetGetRandomRow: {
      const step: SpreadsheetGetRandomRowSchema = {
        id: createId(),
        stepType: stepTypes.enum.spreadsheetGetRandomRow,
        spreadsheetId,
        sheetName,
        lookup,
        map: map as SpreadsheetSheetToContactMappingSchema[],
        states: [successStateDefaultFn(), errorStateDefaultFn()],
      }
      await getSpreadsheetRandomRow({ ...baseProps, step })
      break
    }

    case stepTypes.enum.spreadsheetSendData: {
      const step: SpreadsheetSendDataSchema = {
        id: createId(),
        stepType: stepTypes.enum.spreadsheetSendData,
        version: spreadsheetStepVersions.enum.v2,
        spreadsheetId,
        sheetName,
        map: map as SpreadsheetContactToSheetMappingSchema[],
        states: [successStateDefaultFn(), errorStateDefaultFn()],
      }
      await sendSpreadsheetData({ ...baseProps, step })
      break
    }

    case stepTypes.enum.spreadsheetUpdateRow: {
      const step: SpreadsheetUpdateRowSchema = {
        id: createId(),
        stepType: stepTypes.enum.spreadsheetUpdateRow,
        version: spreadsheetStepVersions.enum.v2,
        spreadsheetId,
        sheetName,
        lookup,
        map: map as SpreadsheetContactToSheetMappingSchema[],
        states: [successStateDefaultFn(), errorStateDefaultFn()],
      }
      await updateSpreadsheetRow({ ...baseProps, step })
      break
    }

    default:
      baseLogger.warn(`Unknown spreadsheet action: ${spreadsheetAction}`)
      return skipped("unknownSpreadsheetAction")
  }
  return succeeded
}
