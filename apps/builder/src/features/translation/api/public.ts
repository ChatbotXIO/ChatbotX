import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
  possibleErrorsOnTranslating,
} from "@/lib/orpc/orpc-error-helper"
import { assertConversationAccessForCaller } from "@/lib/public-api/member-scope"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { assertCanManageTranslation } from "../lib/assert-can-manage"
import { toSettingsResource } from "../lib/availability"
import {
  getConversationTranslationState,
  updateConversationTranslationState,
} from "../lib/conversation-state"
import { previewTranslation } from "../lib/preview-text"
import { requestTranslations } from "../lib/request-messages"
import { testTranslationSettings } from "../lib/test-settings"
import { updateTranslationSettings } from "../lib/update-settings"
import {
  conversationIdParam,
  previewTranslationRequest,
  requestTranslationsRequest,
  testTranslationSettingsRequest,
  updateConversationTranslationStateRequest,
  updateTranslationSettingsRequest,
} from "../schema/action"
import {
  conversationTranslationStateResource,
  requestTranslationsResource,
  translationPreviewResource,
  translationSettingsResource,
  translationTestResource,
} from "../schema/resource"

// Settings are read by anyone who may read the inbox (a token with `inbox` or
// `settings`); changing them needs `settings`. Per-conversation operations
// belong to the inbox.
const settingsReadAPI = workspaceTokenAuthAPIForScope(["settings", "inbox"])
const settingsWriteAPI = workspaceTokenAuthAPIForScope("settings")
const inboxAPI = workspaceTokenAuthAPIForScope("inbox")

export const translationPublicRouter = {
  getSettings: settingsReadAPI
    .route({
      method: "GET",
      path: "/v1/translation/settings",
      summary: "Get Inbox translation settings",
      description:
        "Returns whether Inbox translation is on, the AI integration and model that translate (never a secret), the workspace language (customer messages are translated into it, agents write in it), `status` (`active`, `needsReconfiguration` when the integration was removed or disabled, `disabled`).",
      tags: ["Translation"],
    })
    .output(translationSettingsResource)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) => await toSettingsResource(context.workspace.id),
    ),

  updateSettings: settingsWriteAPI
    .route({
      method: "PUT",
      path: "/v1/translation/settings",
      summary: "Update Inbox translation settings",
      description:
        "Turns Inbox translation on or off and chooses the AI integration and model that translate. Customer chat text is sent to that provider, and the workspace pays for the calls with its own AI key. Turning it on needs `modelConfig`, and the integration must already be connected and enabled. Customer messages are translated only when someone opens the conversation (or an agent calls `translation.requestMessages`), never in the background, including older ones when someone scrolls back to them. Test a model first with `translation.testSettings`.",
      tags: ["Translation"],
    })
    .input(updateTranslationSettingsRequest)
    .output(translationSettingsResource)
    .errors(possibleErrorsOnTranslating)
    .handler(async ({ context, input }) => {
      await assertCanManageTranslation(context)
      return await updateTranslationSettings({
        workspaceId: context.workspace.id,
        request: input,
      })
    }),

  testSettings: settingsWriteAPI
    .route({
      method: "POST",
      path: "/v1/translation/settings/test",
      summary: "Test AI model for Inbox translation",
      description:
        "Translates a sample sentence into the workspace language with the given model (it does not have to be saved) and returns the translation and the latency. `slow: true` means outgoing messages may not be translated within their 10 second budget and would then not be sent. Makes one paid model call.",
      tags: ["Translation"],
    })
    .input(testTranslationSettingsRequest)
    .output(translationTestResource)
    .errors(possibleErrorsOnTranslating)
    .handler(async ({ context, input }) => {
      await assertCanManageTranslation(context)
      return await testTranslationSettings({
        workspaceId: context.workspace.id,
        request: input,
      })
    }),

  getConversationState: inboxAPI
    .route({
      method: "GET",
      path: "/v1/conversations/{conversationId}/translation",
      summary: "Get conversation translation state",
      description:
        "Returns the customer's language for this conversation (`language`, with `languageSource` `auto` or `manual`) and whether translation applies to it (`effectiveEnabled`). The language starts unknown and is detected from the first reliable customer message that gets translated.",
      tags: ["Translation"],
    })
    .input(conversationIdParam)
    .output(conversationTranslationStateResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const conversation = await assertConversationAccessForCaller(
        context,
        input.conversationId,
      )
      return await getConversationTranslationState({
        workspaceId: context.workspace.id,
        conversation,
      })
    }),

  updateConversationState: inboxAPI
    .route({
      method: "PUT",
      path: "/v1/conversations/{conversationId}/translation",
      summary: "Update conversation translation state",
      description:
        "Sets the customer's language by hand (`language`, such as `es` or `zh-Hant`) or turns translation off (`enabledOverride: false`) or on (`true`) for this conversation only (`null` clears it). In the Inbox a conversation is not translated while a bot handles it or after an agent took it over from the bot for a while, until an agent turns it on; the bot taking it back clears `true`. A language set here is never overwritten by detection. A language that is wrong makes agent messages go out in the wrong language, so check it with `translation.previewText` first.",
      tags: ["Translation"],
    })
    .input(conversationIdParam.and(updateConversationTranslationStateRequest))
    .output(conversationTranslationStateResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { conversationId, ...request } = input
      const conversation = await assertConversationAccessForCaller(
        context,
        conversationId,
      )
      return await updateConversationTranslationState({
        workspaceId: context.workspace.id,
        conversation,
        request,
      })
    }),

  requestMessages: inboxAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{conversationId}/translation/requests",
      summary: "Request translation of customer messages",
      description:
        "Queues up to 20 inbound text messages for translation into the workspace language and returns at once with `accepted` and `skipped` (each with a `reason`: noise such as emoji, not a direct text message, already translated, already in progress, translation off or unavailable). Translation runs in the background. To read a result, call `messages.list` (or `messages.get`) a few seconds later and read the message's `translation` field. Messages are never translated unless you call this: an AI agent must request the ones it needs to read. Each translated message uses one paid model call, shared across a batch of up to 10.",
      successStatus: 202,
      tags: ["Translation"],
    })
    .input(conversationIdParam.and(requestTranslationsRequest))
    .output(requestTranslationsResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { conversationId, ...request } = input
      await assertConversationAccessForCaller(context, conversationId)
      return await requestTranslations({
        workspaceId: context.workspace.id,
        conversationId,
        request,
      })
    }),

  previewText: inboxAPI
    .route({
      method: "POST",
      path: "/v1/conversations/{conversationId}/translation/preview",
      summary: "Preview outgoing message translation",
      description:
        "Translates a sentence into this conversation's customer language and returns it without sending anything. Use it to review a translation, then pass it as `editedTranslation` (with `translate: true`) to `messages.create` so exactly that text is sent. Fails with `translationUnknownLanguage` until the customer's language is known. Makes one paid model call.",
      tags: ["Translation"],
    })
    .input(conversationIdParam.and(previewTranslationRequest))
    .output(translationPreviewResource)
    .errors(possibleErrorsOnTranslating)
    .handler(async ({ context, input }) => {
      const { conversationId, ...request } = input
      const conversation = await assertConversationAccessForCaller(
        context,
        conversationId,
      )
      return await previewTranslation({
        workspaceId: context.workspace.id,
        conversation,
        request,
      })
    }),
}
