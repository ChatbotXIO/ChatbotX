import { metaConversionsService } from "@chatbotx.io/business"
import { metaCapiEventChannelSchema } from "@chatbotx.io/database/schema"
import type { SendMetaCapiEventSchema } from "@chatbotx.io/flow-config"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"
import { logger } from "../../../lib/logger"
import type { ExecuteStepProps } from "../flow-utils"
import type { ExecuteStepResult } from "../step"
import { enqueueCapiEvent } from "./capi-input-error"
import { sanitizeCapiError } from "./sanitize-capi-error"

export async function handleSendMetaCapiEventStep(
  props: ExecuteStepProps<SendMetaCapiEventSchema>,
): Promise<ExecuteStepResult> {
  const { contactInbox, conversation, step } = props

  try {
    const capiChannel = metaCapiEventChannelSchema.safeParse(
      contactInbox.channel,
    )
    if (!capiChannel.success) {
      return {
        status: "error",
        result: null,
        errorMessage: `Unsupported Meta CAPI channel: ${contactInbox.channel}`,
      }
    }
    const channel = capiChannel.data

    // Resolve any `{{variable}}` templates in value/currency/contentIds
    // before validating/enqueuing. `resolveContactVariablesDeep` is a no-op
    // (no extra DB work) when none of these three fields contain a
    // placeholder, so a step with only static values stays on the hot path.
    const resolved = await resolveContactVariablesDeep(
      conversation.contactId,
      {
        value: step.value,
        currency: step.currency,
        contentIds: step.contentIds,
      },
      { contactInbox, conversation },
    )

    await enqueueCapiEvent(
      {
        workspaceId: conversation.workspaceId,
        channel,
        contactInboxId: contactInbox.id,
        inboxId: contactInbox.inboxId,
        source: "flowStep",
        sourceKey: metaConversionsService.buildSourceKey({
          scope: "flow",
          scopeId: step.id,
          contactInboxId: contactInbox.id,
          channel,
          actionSource: step.actionSource,
        }),
        eventName: step.eventName,
        actionSource: step.actionSource,
        contentType: step.contentType,
        contentIds: resolved.contentIds,
        value: resolved.value,
        currency: resolved.currency,
        contentCategory: step.contentCategory,
        contentName: step.contentName,
      },
      { contactId: conversation.contactId, resolved },
    )

    return { status: "success", result: null }
  } catch (error) {
    // Never log the raw error: a resolved template can carry the request's
    // Authorization header via a wrapped Graph/business-layer error — see
    // `sanitize-capi-error.ts`.
    const sanitized = sanitizeCapiError(error)
    logger.warn(
      {
        err: sanitized,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        stepId: step.id,
      },
      "Failed to enqueue Meta CAPI flow step event",
    )

    return {
      status: "error",
      result: null,
      errorMessage: sanitized.message,
    }
  }
}
