import {
  adsConversionService,
  type RecordFlowStepConversionInput,
} from "@chatbotx.io/business"
import type {
  TrackAdsLeadSchema,
  TrackAdsPurchaseSchema,
} from "@chatbotx.io/flow-config"
import { logger } from "../../../lib/logger"
import type { ExecuteStepProps } from "../flow-utils"
import type { ExecuteStepResult } from "../step"

/**
 * Backs the Flow steps `trackAdsLead`/`trackAdsPurchase`
 * (`packages/flow-config/src/steps/track-ads-{lead,purchase}.ts`). REUSES the
 * ads-conversion pipeline (attribution gate + find-or-create + CAPI send) via
 * `adsConversionService.recordFlowStepConversion` — this handler is a thin
 * adapter from the flow-execution runtime to that business-layer call,
 * mirroring `handleSendMetaCapiEventStep` (send-meta-capi-event-step-handler.ts)
 * in this same directory.
 *
 * The flow node id comes from `props.targetNodeId` — a runtime handler prop
 * (also stamped as `step.nodeId` in `flow.ts:502`), NOT a declared field on
 * `TrackAdsLeadSchema`/`TrackAdsPurchaseSchema`. `recordFlowStepConversion`
 * silently no-ops (returns `null`, no error) for a contact without WhatsApp
 * CTWA / Meta ad-referral attribution — that is a SUCCESSFUL step execution
 * (the step "ran", it just had nothing to record), so this handler always
 * returns `status: "success"` unless the call actually throws.
 */
async function recordTrackAdsFlowStepConversion(
  props: ExecuteStepProps<TrackAdsLeadSchema | TrackAdsPurchaseSchema>,
  eventType: RecordFlowStepConversionInput["eventType"],
  value?: string,
  currency?: string,
): Promise<ExecuteStepResult> {
  const { contactInbox, conversation, targetNodeId, step } = props

  if (!targetNodeId) {
    return {
      status: "error",
      result: null,
      errorMessage: "Missing flow node id for ads conversion tracking step",
    }
  }

  try {
    await adsConversionService.recordFlowStepConversion({
      workspaceId: conversation.workspaceId,
      contactInboxId: contactInbox.id,
      flowNodeId: targetNodeId,
      eventType,
      value,
      currency,
    })

    return { status: "success", result: null }
  } catch (error) {
    logger.warn(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        stepId: step.id,
        flowNodeId: targetNodeId,
        eventType,
      },
      "Failed to record ads conversion for flow step",
    )

    return {
      status: "error",
      result: null,
      errorMessage:
        error instanceof Error
          ? error.message
          : "Failed to record ads conversion",
    }
  }
}

export function handleTrackAdsLeadStep(
  props: ExecuteStepProps<TrackAdsLeadSchema>,
): Promise<ExecuteStepResult> {
  return recordTrackAdsFlowStepConversion(props, "lead")
}

export function handleTrackAdsPurchaseStep(
  props: ExecuteStepProps<TrackAdsPurchaseSchema>,
): Promise<ExecuteStepResult> {
  return recordTrackAdsFlowStepConversion(
    props,
    "purchase",
    props.step.value,
    props.step.currency,
  )
}
