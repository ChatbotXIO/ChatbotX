import type { AdsConversionChannel } from "@chatbotx.io/database/schema"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"

export type EnqueueTemplateSentEvaluationInput = {
  workspaceId: string
  channel: AdsConversionChannel
  integrationId: string
  contactInboxId: string
  templateId: string
  messageId: string
}

/**
 * Shared by `processWhatsappTemplate` and `processMessengerTemplate`
 * (Amendment A1 — the `templateSent` conversion trigger extends to
 * Messenger): fires unconditionally after a successful channel send — the
 * evaluator's own cheap attribution lookup is the real gate, not a
 * pre-check here — and never fails the send: a Redis enqueue failure is
 * logged and swallowed.
 */
export async function enqueueTemplateSentEvaluation(
  input: EnqueueTemplateSentEvaluationInput,
): Promise<void> {
  try {
    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.evaluateTemplateSent,
        data: {
          workspaceId: input.workspaceId,
          channel: input.channel,
          integrationId: input.integrationId,
          contactInboxId: input.contactInboxId,
          templateId: input.templateId,
        },
      },
      {
        jobId: `ads-conversion-evaluate-template-${input.messageId}`,
      },
    )
  } catch (err) {
    logger.warn(
      {
        err,
        workspaceId: input.workspaceId,
        channel: input.channel,
        integrationId: input.integrationId,
        contactInboxId: input.contactInboxId,
        templateId: input.templateId,
        messageId: input.messageId,
      },
      "Failed to enqueue ads conversion template-sent evaluation",
    )
  }
}
