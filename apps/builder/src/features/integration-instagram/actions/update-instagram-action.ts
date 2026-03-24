"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import {
  flowVersionModel,
  integrationInstagramModel,
} from "@aha.chat/database/schema"
import type { FlowVersionModel } from "@aha.chat/database/types"
import { PersistentMenuType } from "@aha.chat/database/types"
import { encodeButtonPayload } from "@aha.chat/flow-config"
import type { InstagramAuthValue } from "@aha.chat/integration-instagram"
import { integration as integrationInstagram } from "@aha.chat/integration-instagram"
import type { InstagramPersistentMenuRequest } from "@aha.chat/integration-instagram/schemas"
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
              persistentMenus: parsedInput.persistentMenus,
            })
            .where(eq(integrationInstagramModel.id, id))

          if (integrationInstagramData) {
            const auth = integrationInstagramData.auth as InstagramAuthValue
            const ctx = { chatbot, auth }

            await integrationInstagram.actions.updatePersistentMenu({
              ctx,
              params: await buildPersistentMenuParams(
                parsedInput.persistentMenus,
              ),
            })
          }

          revalidateCacheTags([`chatbots:${chatbotId}#instagram`])
        })
      } catch (_error) {
        throw new ChatbotXException("Failed to update Instagram integration")
      }
    },
  )

const buildPersistentMenuParams = async (
  menus: PersistentMenuSchema[],
): Promise<InstagramPersistentMenuRequest> => {
  const items: InstagramPersistentMenuRequest = []
  for (const menu of menus) {
    if (menu.type === PersistentMenuType.flow) {
      const flowVersion = await findOrFail<FlowVersionModel>(flowVersionModel, {
        flowId: menu.flowId,
        isLatest: true,
      })
      items.push({
        type: "postback",
        title: menu.label,
        payload: encodeButtonPayload({
          flowId: menu.flowId,
          flowVersionId: flowVersion.id,
          buttonId: "",
        }),
      })
    } else if (menu.type === PersistentMenuType.website) {
      items.push({
        type: "web_url",
        title: menu.label,
        url: menu.url,
      })
    }
  }
  return items
}
