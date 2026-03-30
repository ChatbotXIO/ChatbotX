"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import {
  flowVersionModel,
  integrationInstagramModel,
} from "@aha.chat/database/schema"
import {
  type FlowVersionModel,
  type IntegrationInstagramModel,
  PersistentMenuType,
} from "@aha.chat/database/types"
import { encodeButtonPayload } from "@aha.chat/flow-config"
import type { InstagramAuthValue } from "@aha.chat/integration-instagram"
import { integration as integrationInstagram } from "@aha.chat/integration-instagram"
import type {
  IceBreaker,
  InstagramButton,
  InstagramProfileRequest,
} from "@aha.chat/integration-instagram/schemas"
import { findChatbotOrFail } from "@/features/chatbot/queries"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"
import { findIntegrationInstagram } from "../queries"
import {
  type ConversationStarter,
  type PersistentMenuSchema,
  type UpdateInstagramRequest,
  updateInstagramRequest,
} from "../schemas"

export const updateInstagramAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateInstagramRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      parsedInput: UpdateInstagramRequest
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      try {
        await db.transaction(async (tx) => {
          const chatbot = await findChatbotOrFail({ id: chatbotId })
          const integrationInstagramData = await findIntegrationInstagram({
            id,
          })

          await tx
            .update(integrationInstagramModel)
            .set({
              welcomeFlowId: parsedInput.welcomeFlowId,
              conversationStarters: parsedInput.conversationStarters,
              persistentMenus: parsedInput.persistentMenus,
            })
            .where(eq(integrationInstagramModel.id, id))

          if (integrationInstagramData) {
            const auth = integrationInstagramData.auth as InstagramAuthValue
            const ctx = { chatbot, auth }

            if (parsedInput.conversationStarters.length) {
              await integrationInstagram.channels.channel.profile?.update?.({
                ctx,
                params: {
                  ice_breakers: await buildIceBreakersParams(
                    parsedInput.conversationStarters,
                  ),
                  persistent_menu: await buildPersistentMenuParams(
                    parsedInput.persistentMenus,
                  ),
                },
              })
            }
          }

          revalidateCacheTags([`chatbots:${chatbotId}#instagram`])
        })
      } catch (_error) {
        throw new ChatbotXException("Failed to update Instagram integration")
      }
    },
  )

const buildIceBreakersParams = async (
  conversationStarters: ConversationStarter[],
): Promise<IceBreaker[]> => {
  const callToActions = await Promise.all(
    conversationStarters.map(async (item) => {
      const flowVersion = await findOrFail<FlowVersionModel>(flowVersionModel, {
        flowId: item.flowId,
        isLatest: true,
      })
      return {
        question: item.question,
        payload: encodeButtonPayload({
          flowId: item.flowId,
          flowVersionId: flowVersion.id,
          buttonId: "",
        }),
      }
    }),
  )
  return [
    {
      locale: "default",
      call_to_actions: callToActions,
    },
  ]
}

const buildPersistentMenuParams = async (
  persistentMenus: PersistentMenuSchema[],
): Promise<InstagramProfileRequest["persistent_menu"]> => {
  const callToActions = await parseInstagramButtons(persistentMenus)
  return [
    {
      locale: "default",
      call_to_actions: callToActions,
    },
  ]
}
export const parseInstagramButtons = async (
  persistentMenus: IntegrationInstagramModel["persistentMenus"],
): Promise<InstagramButton[]> => {
  const buttons: InstagramButton[] = []
  for (const menu of persistentMenus as PersistentMenuSchema[]) {
    if (menu && menu.type === PersistentMenuType.flow) {
      const flowVersion = await findOrFail<FlowVersionModel>(flowVersionModel, {
        flowId: menu.flowId,
        isLatest: true,
      })
      buttons.push({
        type: "postback",
        title: menu.label,
        payload: encodeButtonPayload({
          flowId: menu.flowId,
          flowVersionId: flowVersion.id,
          buttonId: "",
        }),
      })
    } else if (
      menu &&
      menu.type === PersistentMenuType.website &&
      "url" in menu
    ) {
      buttons.push({
        type: "web_url",
        title: menu.label,
        url: menu.url,
      })
    }
  }
  return buttons
}
