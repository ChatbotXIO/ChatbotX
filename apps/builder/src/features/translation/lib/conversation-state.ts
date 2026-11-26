import {
  conversationService,
  inboxTranslationSettingsService,
  normalizeLanguageCode,
  queueWorkspaceRealtimeEvent,
} from "@chatbotx.io/business"
import { validationException } from "@chatbotx.io/business/errors"
import type { ConversationModel } from "@chatbotx.io/database/types"
import {
  RealtimeEventType,
  routeForConversation,
} from "@chatbotx.io/realtime-protocol"
import type { UpdateConversationTranslationStateRequest } from "../schema/action"
import type { ConversationTranslationStateResource } from "../schema/resource"
import { toConversationStateResource } from "./availability"

export async function getConversationTranslationState(props: {
  workspaceId: string
  conversation: Pick<ConversationModel, "additionalAttributes">
}): Promise<ConversationTranslationStateResource> {
  const settings = await inboxTranslationSettingsService.get(props.workspaceId)
  return toConversationStateResource(settings, props.conversation)
}

/**
 * Changes a conversation's translation state: the per-conversation switch
 * (`false` off, `true` on in the Inbox even while a bot handles the
 * conversation, `null` back to the default) and/or the customer language an
 * agent sets by hand. The change is broadcast so other open inboxes update
 * their chip, badge and composer.
 */
export async function updateConversationTranslationState(props: {
  workspaceId: string
  conversation: ConversationModel
  request: UpdateConversationTranslationStateRequest
}): Promise<ConversationTranslationStateResource> {
  const { workspaceId, request } = props
  let conversation = props.conversation
  if (request.enabledOverride === undefined && request.language === undefined) {
    throw validationException(
      "enabledOverride",
      "Pass `enabledOverride` or `language`",
    )
  }

  // Validated before any write, so a bad language never leaves the override
  // changed behind an error. Stored in the canonical form (`es`, `zh-Hans`)
  // that detection also writes.
  const language =
    request.language === undefined
      ? undefined
      : normalizeLanguageCode(request.language)
  if (language === null) {
    throw validationException("language", "Unknown language code")
  }

  if (request.enabledOverride !== undefined) {
    const updated = await conversationService.setTranslationOverride({
      workspaceId,
      conversationId: conversation.id,
      enabledOverride: request.enabledOverride,
    })
    conversation = updated ?? conversation
  }
  if (language !== undefined) {
    const updated = await conversationService.setTranslationLanguage({
      workspaceId,
      conversationId: conversation.id,
      language,
    })
    conversation = updated ?? conversation
  }

  // Every open inbox updates its chip, badge and composer: a language set by
  // hand, or translation turned off or back on (by an agent, or by the server
  // after the AI provider failed).
  const translation = conversation.additionalAttributes?.translation
  await queueWorkspaceRealtimeEvent(workspaceId, {
    eventType: RealtimeEventType.messageTranslationUpdated,
    data: {
      conversationId: conversation.id,
      ...(language !== undefined && {
        conversationLanguage: translation?.language,
      }),
      ...(request.enabledOverride !== undefined && {
        conversationEnabledOverride: request.enabledOverride,
      }),
      items: [],
    },
    route: routeForConversation(conversation),
  })

  return await getConversationTranslationState({ workspaceId, conversation })
}
