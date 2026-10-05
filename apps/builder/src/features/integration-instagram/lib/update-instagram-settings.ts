import {
  buildContext,
  flowService,
  inboxService,
  instagramIntegrationService,
} from "@chatbotx.io/business"
import { moveBrandingMenuLast } from "@chatbotx.io/business/branding"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  type InstagramConversationStarter,
  type InstagramPersistentMenu,
  instagramPersistentMenuTypes,
} from "@chatbotx.io/database/partials"
import { flowVersionModel } from "@chatbotx.io/database/schema"
import type { IntegrationInstagramModel } from "@chatbotx.io/database/types"
import { encodeButtonPayload } from "@chatbotx.io/flow-config"
import {
  type IceBreaker,
  type InstagramAuthValue,
  type InstagramButton,
  type InstagramProfileRequest,
  integration as integrationInstagram,
} from "@chatbotx.io/integration-instagram"
import { integration as integrationInstagramFacebook } from "@chatbotx.io/integration-instagram-facebook"
import { getBrandingUrl } from "@/features/integration-webchat/lib"
import { logger } from "@/lib/log"
import { findIntegrationInstagram } from "../queries"
import type { UpdateInstagramRequest } from "../schema/action"

/** Every flow id the settings point at — welcome flow, menu items, ice breakers. */
const collectFlowIds = (input: UpdateInstagramRequest): string[] => [
  ...new Set([
    ...(input.welcomeFlowId ? [input.welcomeFlowId] : []),
    ...input.persistentMenus.flatMap((menu) =>
      menu.type === instagramPersistentMenuTypes.enum.flow ? [menu.flowId] : [],
    ),
    ...input.conversationStarters.map((starter) => starter.flowId),
  ]),
]

/**
 * Saves an Instagram account's settings and pushes ice breakers / persistent
 * menu to Instagram. Plain function (no session) so the builder action and the
 * public API share it.
 */
export const updateInstagram = async (
  ctx: { workspaceId: string; id: string },
  input: UpdateInstagramRequest,
): Promise<void> => {
  // Before the try: its catch collapses every error into a generic message,
  // and a foreign flow id deserves its own not-found error.
  await flowService.assertAllExist({
    workspaceId: ctx.workspaceId,
    flowIds: collectFlowIds(input),
  })

  try {
    const inboxId = await db.transaction(async (tx) => {
      const integrationInstagramData = await findIntegrationInstagram({
        workspaceId: ctx.workspaceId,
        id: ctx.id,
      })

      await instagramIntegrationService.updateProfileFields(
        { id: ctx.id },
        {
          welcomeFlowId: input.welcomeFlowId,
          conversationStarters: input.conversationStarters,
          persistentMenus: input.persistentMenus,
        },
        tx,
      )

      if (integrationInstagramData) {
        const auth = integrationInstagramData.auth as InstagramAuthValue
        const isFacebook = integrationInstagramData.type === "facebook"
        const channelIntegration = isFacebook
          ? integrationInstagramFacebook
          : integrationInstagram
        const botContext = await buildContext({
          workspaceId: ctx.workspaceId,
          integrationType: isFacebook ? "instagramFacebook" : "instagram",
          integration: { ...integrationInstagramData, auth },
        })

        const fieldsToDelete = getInstagramFieldsToDelete(input)
        if (fieldsToDelete.length > 0) {
          await channelIntegration.runChannelHandler(
            "bot",
            "deleteProfileFields",
            {
              ctx: botContext,
              fields: fieldsToDelete,
            },
          )
        }

        const profileData: Partial<InstagramProfileRequest> = {}

        if (input.conversationStarters.length) {
          profileData.ice_breakers = await buildIceBreakersParams(
            input.conversationStarters,
          )
        }

        if (input.persistentMenus.length) {
          profileData.persistent_menu = await buildPersistentMenuParams(
            input.persistentMenus,
            botContext.platform.appUrl,
          )
        }

        if (Object.keys(profileData).length > 0) {
          await channelIntegration.runChannelHandler("bot", "updateProfile", {
            ctx: botContext,
            data: profileData as InstagramProfileRequest,
          })
        }
      }

      return integrationInstagramData.inboxId
    })

    if (input.markReadOnOutbound !== undefined) {
      await inboxService.updateMarkReadOnOutbound({
        workspaceId: ctx.workspaceId,
        id: inboxId,
        enabled: input.markReadOnOutbound,
      })
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to update Instagram integration")
    throw new ChatbotXException("Failed to update Instagram integration")
  }
}

const getInstagramFieldsToDelete = (
  input: Pick<
    UpdateInstagramRequest,
    "conversationStarters" | "persistentMenus"
  >,
): string[] => {
  const fields: string[] = []
  if (!input.conversationStarters.length) {
    fields.push("ICE_BREAKERS")
  }
  if (!input.persistentMenus.length) {
    fields.push("PERSISTENT_MENU")
  }
  return fields
}

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
  appUrl: string,
): Promise<InstagramProfileRequest["persistent_menu"]> => {
  const brandingUrl = getBrandingUrl("instagram", appUrl)
  const menus = moveBrandingMenuLast(persistentMenus, brandingUrl)
  const callToActions = await parseInstagramButtons(menus)
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
