"use server"
import { conversationService } from "@chatbotx.io/business"
import {
  ChannelPostShareRefusedError,
  ChatbotXException,
} from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { TranslationNotSentException } from "@/features/translation/lib/errors"
import { sendOutgoing } from "@/features/translation/lib/send-outgoing"
import { assertConversationAccessForCaller } from "@/lib/public-api/member-scope"
import { workspaceActionClient } from "@/lib/safe-action"
import { createMessageWithRoutingBypassRequest } from "../schema/mutation"
export const createMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createMessageWithRoutingBypassRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
      ctx,
    } = props

    // A translated send spends a model call, so it is member-scoped like every
    // other translation action: an agent limited to assigned conversations
    // gets a 404 elsewhere. A plain send keeps its behavior.
    const conversation =
      parsedInput.translate === true
        ? await assertConversationAccessForCaller(
            {
              workspace: ctx.workspace,
              member: ctx.workspaceMember,
              user: ctx.user,
            },
            conversationId,
          )
        : await conversationService.findByOrFail({
            where: {
              id: conversationId,
              workspaceId,
            },
          })

    const contactInbox =
      await conversationService.resolveContactInboxForConversation({
        conversation,
        workspaceId,
        inboxId: parsedInput.inboxId,
      })

    try {
      return await sendOutgoing({
        workspaceId,
        conversation,
        contactInbox,
        input: parsedInput,
        user: ctx.user,
        sendFrom: "inbox",
      })
    } catch (error) {
      // Not a failed request: the composer marks the message "Translation
      // failed" (and, when translation was turned off, says so) instead of
      // showing a generic error.
      if (error instanceof TranslationNotSentException) {
        return {
          translationNotSent: {
            reason: error.reason,
            conversationTranslation: error.conversationTranslation,
          },
        }
      }
      // The composer shows `serverError` as is: say it in the member's language
      // (the API keeps the English `messagingWindowClosed` message).
      if (
        error instanceof ChatbotXException &&
        error.code === "messagingWindowClosed"
      ) {
        const t = await getTranslations()
        throw new ChatbotXException(
          t("messages.messagingWindowClosed"),
          error.code,
          error.httpStatusCode,
        )
      }
      // Not a failed request either: the composer words the refusal in the
      // agent's language from the typed reason (the message is for API clients).
      if (error instanceof ChannelPostShareRefusedError) {
        return { channelPostRefused: { reason: error.reason } }
      }
      throw error
    }
  })
