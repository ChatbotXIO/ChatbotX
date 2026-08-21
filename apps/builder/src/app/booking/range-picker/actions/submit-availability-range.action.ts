"use server"

import { verifyAppointmentWebviewToken } from "@chatbotx.io/encryption"
import {
  APPOINTMENT_AVAILABILITY_RANGE_SELECTION_PAYLOAD_TYPE,
  APPOINTMENT_AVAILABILITY_RANGE_SKIPPED_PAYLOAD_TYPE,
} from "@chatbotx.io/flow-config"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import {
  type SubmitAvailabilityRangeInput,
  submitAvailabilityRangeRequestSchema,
} from "@/features/booking-webview/schemas/availability-range-action"
import { logger } from "@/lib/log"
import { actionClient } from "@/lib/safe-action"

export const submitAvailabilityRangeAction = actionClient
  .inputSchema(submitAvailabilityRangeRequestSchema)
  .action(async ({ parsedInput }) => submitAvailabilityRange(parsedInput))

export async function submitAvailabilityRange(
  parsedInput: SubmitAvailabilityRangeInput,
) {
  const tokenPayload = await verifyAppointmentWebviewToken(parsedInput.token)
  if (tokenPayload.mode !== "selectAvailabilityRange") {
    throw new Error("Invalid appointment range token mode")
  }

  try {
    if (parsedInput.skip) {
      await integrationQueue.add(
        IntegrationJobAction.sendFlow,
        {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: tokenPayload.conversationId,
            contactInboxId: tokenPayload.contactInboxId,
            flowId: tokenPayload.flowId,
            flowVersionId: tokenPayload.flowVersionId,
            nodeId: tokenPayload.nodeId,
            startFromStepId: tokenPayload.stepId,
            metadata: {
              type: APPOINTMENT_AVAILABILITY_RANGE_SKIPPED_PAYLOAD_TYPE,
              stepId: tokenPayload.stepId,
              contactInboxId: tokenPayload.contactInboxId,
            },
            origin: "channel",
          },
        },
        {
          jobId: `appointment-range-skip-${tokenPayload.conversationId}-${tokenPayload.stepId}`,
        },
      )

      return { completed: true }
    }

    await integrationQueue.add(
      IntegrationJobAction.sendFlow,
      {
        type: IntegrationJobAction.sendFlow,
        data: {
          conversationId: tokenPayload.conversationId,
          contactInboxId: tokenPayload.contactInboxId,
          flowId: tokenPayload.flowId,
          flowVersionId: tokenPayload.flowVersionId,
          nodeId: tokenPayload.nodeId,
          startFromStepId: tokenPayload.stepId,
          metadata: {
            type: APPOINTMENT_AVAILABILITY_RANGE_SELECTION_PAYLOAD_TYPE,
            stepId: tokenPayload.stepId,
            contactInboxId: tokenPayload.contactInboxId,
            startDate: parsedInput.startDate,
            endDate: parsedInput.endDate,
          },
          origin: "channel",
        },
      },
      {
        jobId: `appointment-range-${tokenPayload.conversationId}-${tokenPayload.stepId}-${new Date(parsedInput.startDate).getTime()}-${new Date(parsedInput.endDate).getTime()}`,
      },
    )

    return { completed: true }
  } catch (error) {
    logger.warn(
      {
        err: normalizeError(error),
        workspaceId: tokenPayload.workspaceId,
        conversationId: tokenPayload.conversationId,
        action: "submitAvailabilityRange",
        reason: "resumeFlowAfterAvailabilityRangeFailed",
      },
      "Failed to resume flow after appointment availability range selection",
    )
    throw error
  }
}
