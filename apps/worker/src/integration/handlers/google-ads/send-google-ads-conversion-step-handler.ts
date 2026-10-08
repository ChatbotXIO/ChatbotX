import { googleAdsConversionService } from "@chatbotx.io/business"
import type { SendGoogleAdsConversionSchema } from "@chatbotx.io/flow-config"
import { sanitizeGoogleAdsError } from "@chatbotx.io/integration-google-ads"
import {
  type GoogleAdsConversionErrorCode,
  googleAdsConversionErrorCodes,
} from "@chatbotx.io/utils/google-click"
import { logger } from "../../../lib/logger"
import { isDurableFlowExecutionKey } from "../../flow-execution-key"
import type { ExecuteStepProps } from "../flow-utils"
import type { ExecuteStepResult } from "../step"
import {
  configRefusalCodes,
  describeGoogleAdsConsentFailure,
  describeGoogleAdsInputFailure,
  reportGoogleAdsInputFailure,
} from "./google-ads-input-error"
import { resolveGoogleAdsConversionInputs } from "./resolve-conversion-inputs"

/** The key of one run of this step for one contact, or `undefined` when no durable one exists. */
const stepOccurrenceKey = (input: {
  flowExecutionKey: string | undefined
  contactInboxId: string
  stepId: string
}): string | undefined =>
  isDurableFlowExecutionKey(input.flowExecutionKey)
    ? `flow:${input.flowExecutionKey}:${input.contactInboxId}:${input.stepId}`
    : undefined

const errorResult = (
  errorMessage: GoogleAdsConversionErrorCode,
): ExecuteStepResult => ({ status: "error", result: null, errorMessage })

export async function handleSendGoogleAdsConversionStep(
  props: ExecuteStepProps<SendGoogleAdsConversionSchema>,
): Promise<ExecuteStepResult> {
  const { contactInbox, conversation, step } = props

  const report = (message: string) =>
    reportGoogleAdsInputFailure({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      sourceId: contactInbox.sourceId,
      message,
    })

  try {
    // Resolve `{{variable}}` templates (and the workspace consent) before
    // recording. No extra contact load when none contains a placeholder.
    const resolved = await resolveGoogleAdsConversionInputs({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      fields: {
        value: step.value,
        currency: step.currency,
        dedupMode: step.dedupMode,
        dedupId: step.dedupId,
        conversionTime: step.conversionTime,
        customerType: step.customerType,
        customerValueBucket: step.customerValueBucket,
      },
      source: { contactInbox, conversation },
    })
    if (!resolved.ok) {
      await report(
        describeGoogleAdsConsentFailure(resolved.code, resolved.setting),
      )
      return errorResult(resolved.code)
    }
    const { dedupMode, fields, recordFields } = resolved.inputs

    const outcome = await googleAdsConversionService.record({
      workspaceId: conversation.workspaceId,
      contactInboxId: contactInbox.id,
      source: "flowStep",
      scopeId: step.id,
      conversionActionId: step.conversionActionId,
      ...recordFields,
      // Only `event` dedup reads it; the other modes must never see a job id.
      occurrenceKey:
        dedupMode === "event"
          ? stepOccurrenceKey({
              flowExecutionKey: props.flowExecutionKey,
              contactInboxId: contactInbox.id,
              stepId: step.id,
            })
          : undefined,
      matchEmail: step.matchEmail,
      matchPhone: step.matchPhone,
    })

    switch (outcome.status) {
      case "queued":
        return { status: "success", result: null }
      case "unsupportedChannel":
        return errorResult(googleAdsConversionErrorCodes.unsupportedChannel)
      case "noClick":
        return errorResult(googleAdsConversionErrorCodes.noClick)
      case "noAccount":
        return errorResult(googleAdsConversionErrorCodes.noAccount)
      case "unknownConversionAction":
        return errorResult(
          googleAdsConversionErrorCodes.unknownConversionAction,
        )
      case "actionDisabled":
        return errorResult(googleAdsConversionErrorCodes.actionDisabled)
      case "incompatibleAction":
        return errorResult(googleAdsConversionErrorCodes.incompatibleAction)
      case "unsupportedAction":
        return errorResult(googleAdsConversionErrorCodes.unsupportedAction)
      case "missingOccurrenceKey":
        return errorResult(googleAdsConversionErrorCodes.missingOccurrenceKey)
      case "invalidValue":
      case "missingDedupId":
      case "invalidDedupId":
      case "invalidCustomerProperty":
      case "invalidConversionTime": {
        // The resolved templates produced something the business rules
        // reject: the workspace's configuration problem, so it goes to the
        // Error Log (resolved values only, never a click id or consent).
        const code = configRefusalCodes[outcome.status]
        await report(describeGoogleAdsInputFailure(code, fields))
        return errorResult(code)
      }
      default: {
        const unreachable: never = outcome
        throw new Error(`Unhandled Google Ads outcome: ${String(unreachable)}`)
      }
    }
  } catch (error) {
    logger.warn(
      {
        // Message only: the error may carry bound parameters (click id).
        reason: sanitizeGoogleAdsError(error).message,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        stepId: step.id,
      },
      "Failed to record Google Ads conversion flow step",
    )
    return {
      status: "error",
      result: null,
      errorMessage: googleAdsConversionErrorCodes.recordFailed,
    }
  }
}
