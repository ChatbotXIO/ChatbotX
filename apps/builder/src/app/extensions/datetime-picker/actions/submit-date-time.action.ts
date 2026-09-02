"use server"

import { verifyUserDataWebviewToken } from "@chatbotx.io/encryption"
import { GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE } from "@chatbotx.io/flow-config"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import {
  type SubmitDateTimeInput,
  submitDateTimeRequestSchema,
} from "@/features/get-user-data-webview/schema/action"
import { actionClient } from "@/lib/safe-action"

export const submitDateTimeAction = actionClient
  .inputSchema(submitDateTimeRequestSchema)
  .action(async ({ parsedInput }) => submitDateTime(parsedInput))

export async function submitDateTime(parsedInput: SubmitDateTimeInput) {
  // Authoritative: every field used below comes from the verified token,
  // never from client input. `selectedValue` is the only client-supplied
  // value and is zod-validated as an ISO datetime string above.
  const payload = await verifyUserDataWebviewToken(parsedInput.token)

  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: payload.conversationId,
      contactInboxId: payload.contactInboxId,
      flowId: payload.flowId,
      flowVersionId: payload.flowVersionId,
      nodeId: payload.nodeId,
      startFromStepId: payload.stepId,
      metadata: {
        type: GET_USER_DATA_WEBVIEW_SELECTION_PAYLOAD_TYPE,
        stepId: payload.stepId,
        challengeId: payload.challengeId,
        contactInboxId: payload.contactInboxId,
        selectedValue: parsedInput.selectedValue,
      },
      origin: "channel",
    },
  })

  // Custom-field persistence and challenge consumption happen in the worker
  // (single source of truth) — see get-user-data.ts handleWebviewSelection.
  return { completed: true }
}
