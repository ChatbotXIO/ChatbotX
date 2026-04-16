"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  type InstagramConversationStarter,
  type InstagramPersistentMenu,
  instagramPersistentMenuTypes,
} from "@chatbotx.io/database/partials"
import {
  flowVersionModel,
  integrationInstagramModel,
} from "@chatbotx.io/database/schema"
import type {
  IntegrationInstagramModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { getStoragePrefix } from "@chatbotx.io/filesystem"
import { encodeButtonPayload } from "@chatbotx.io/flow-config"
import {
  type IceBreaker,
  type InstagramAuthValue,
  type InstagramButton,
  type InstagramProfileRequest,
  integration as integrationInstagram,
} from "@chatbotx.io/integration-instagram"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { findIntegrationInstagram } from "../queries"
import { type UpdateInstagramRequest, updateInstagramRequest } from "../schemas"

export const updateInstagramAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateInstagramRequest)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      ctx: { workspace: WorkspaceModel }
      parsedInput: UpdateInstagramRequest
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      try {
        await db.transaction(async (tx) => {
          const integrationInstagramData = await findIntegrationInstagram({
            workspaceId: ctx.workspace.id,
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
            const integrationContext = {
              workspace: ctx.workspace,
              auth,
              storagePrefix: getStoragePrefix(
                ctx.workspace.id,
                integrationInstagramData.inboxId,
              ),
            }

            if (parsedInput.conversationStarters.length) {
              await integrationInstagram.channels.channel.bot?.updateProfile?.({
                ctx: integrationContext,
                data: {
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

          revalidateCacheTags([`chatbots:${workspaceId}#instagram`])
        })
      } catch (_error) {
        throw new ChatbotXException("Failed to update Instagram integration")
      }
    },
  )

const buildIceBreakersParams = async (
  conversationStarters: InstagramConversationStarter[],
): Promise<IceBreaker[]> => {
  const callToActions = await Promise.all(
    conversationStarters.map(async (item) => {
      const flowVersion = await findOrFail({
        table: flowVersionModel,
        where: {
          flowId: item.flowId,
          isLatest: true,
        },
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
  persistentMenus: InstagramPersistentMenu[],
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
  for (const menu of persistentMenus as InstagramPersistentMenu[]) {
    if (menu.type === instagramPersistentMenuTypes.enum.flow) {
      const flowVersion = await findOrFail({
        table: flowVersionModel,
        where: {
          flowId: menu.flowId,
          isLatest: true,
        },
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
      menu.type === instagramPersistentMenuTypes.enum.url &&
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
