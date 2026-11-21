import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { possibleErrorsOnFindingResource } from "@/lib/orpc/orpc-error-helper"
import { assertConversationAccessForCaller } from "@/lib/public-api/member-scope"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { toSettingsResource } from "../lib/availability"
import { getConversationTranslationState } from "../lib/conversation-state"
import {
  conversationTranslationStateResource,
  translationSettingsResource,
} from "../schema/resource"

/**
 * Session reads the Inbox UI polls through TanStack Query. Mutations go through
 * server actions, which call the same `lib/` functions as the public API.
 * Settings are readable by every member: each agent's Inbox needs the state and
 * the read-only settings card needs the configuration.
 */
const workspaceIdRequest = z.object({ workspaceId: zodBigintAsString() })

export const translationAuthenticatedAPI = {
  getSettings: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/translation/settings",
      summary: "Get Inbox translation settings",
      tags: ["Translation"],
    })
    .input(workspaceIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(translationSettingsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ input }) => await toSettingsResource(input.workspaceId)),

  getConversationState: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/conversations/{conversationId}/translation",
      summary: "Get a conversation's translation state",
      tags: ["Translation"],
    })
    .input(
      workspaceIdRequest.and(z.object({ conversationId: zodBigintAsString() })),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(conversationTranslationStateResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ input, context }) => {
      // Member scope applies, same as the public API: an agent limited to
      // assigned conversations gets a 404 for any other conversation.
      const conversation = await assertConversationAccessForCaller(
        {
          workspace: context.workspace,
          member: context.workspaceMember,
          user: context.user,
        },
        input.conversationId,
      )
      return await getConversationTranslationState({
        workspaceId: input.workspaceId,
        conversation,
      })
    }),
}
