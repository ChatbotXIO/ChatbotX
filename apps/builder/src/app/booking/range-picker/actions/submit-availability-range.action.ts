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
} from "@/features/booking-webview/schema/availability-range-action"
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
  const { flowId, flowVersionId, stepId } = tokenPayload
  if (!(flowId && flowVersionId && stepId)) {
    throw new Error("Appointment range token is missing its flow context")
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
            flowId,
            flowVersionId,
            nodeId: tokenPayload.nodeId,
            startFromStepId: stepId,
            metadata: {
              type: APPOINTMENT_AVAILABILITY_RANGE_SKIPPED_PAYLOAD_TYPE,
              stepId,
              contactInboxId: tokenPayload.contactInboxId,
            },
            origin: "channel",
          },
        },
        {
          jobId: `appointment-range-skip-${tokenPayload.conversationId}-${stepId}`,
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
          flowId,
          flowVersionId,
          nodeId: tokenPayload.nodeId,
          startFromStepId: stepId,
          metadata: {
            type: APPOINTMENT_AVAILABILITY_RANGE_SELECTION_PAYLOAD_TYPE,
            stepId,
            contactInboxId: tokenPayload.contactInboxId,
            startDate: parsedInput.startDate,
            endDate: parsedInput.endDate,
          },
          origin: "channel",
        },
      },
      {
        jobId: `appointment-range-${tokenPayload.conversationId}-${stepId}-${new Date(parsedInput.startDate).getTime()}-${new Date(parsedInput.endDate).getTime()}`,
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
