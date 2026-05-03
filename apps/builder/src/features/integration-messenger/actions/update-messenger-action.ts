"use server"

import { db, eq } from "@chatbotx.io/database/client"
import {
  type MessengerPersistentMenu,
  type MessengerPersona,
  messengerPersistentMenuTypes,
} from "@chatbotx.io/database/partials"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import type {
  IntegrationMessengerModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { getStoragePrefix, uploader } from "@chatbotx.io/filesystem"
import { encodeButtonPayload } from "@chatbotx.io/flow-config"
import {
  integration as integrationMessenger,
  type MessengerProfileRequest,
} from "@chatbotx.io/integration-messenger"
import type {
  FacebookButton,
  MessengerAuthValue,
} from "@chatbotx.io/integration-messenger/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getBrandingUrl } from "@/features/integration-webchat/lib"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"
import { findIntegrationMessenger } from "../queries"
import {
  type UpdateMessengerRequest,
  updateMessengerRequest,
} from "../schema/action"

export const updateMessengerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateMessengerRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [_, id],
      parsedInput,
      ctx: { workspace },
    } = props

    return await updateMessenger(
      {
        workspace,
        id,
      },
      parsedInput,
    )
  })

export const updateMessenger = async (
  ctx: {
    workspace: WorkspaceModel
    id: string
  },
  parsedInput: UpdateMessengerRequest,
) => {
  try {
    await db.transaction(async (tx) => {
      const integrationMessengerData = await findIntegrationMessenger({
        workspaceId: ctx.workspace.id,
        id: ctx.id,
      })
      const newPersonaId = await getPersonaId(
        ctx.workspace,
        integrationMessengerData,
        parsedInput.personas,
      )

      await tx
        .update(integrationMessengerModel)
        .set({
          ...parsedInput,
          personaId: newPersonaId ?? null,
        })
        .where(eq(integrationMessengerModel.id, ctx.id))

      const botCtx = {
        uploader,
        storagePrefix: getStoragePrefix(
          ctx.workspace.id,
          integrationMessengerData.inboxId,
        ),
        auth: integrationMessengerData?.auth as MessengerAuthValue,
      }

      const fieldsToDelete = getFieldsToDelete(parsedInput)
      if (fieldsToDelete.length > 0) {
        await integrationMessenger.channels.channel.bot?.deleteProfileFields?.({
          ctx: botCtx,
          fields: fieldsToDelete,
        })
      }

      const profileParams = getMessengerProfileParams({
        ...integrationMessengerData,
        ...parsedInput,
      })
      if (Object.keys(profileParams).length > 0) {
        await integrationMessenger.channels.channel.bot?.updateProfile?.({
          ctx: botCtx,
          data: profileParams,
        })
      }

      revalidateCacheTags([`workspaces:${ctx.workspace.id}#messenger`])
    })
  } catch (error) {
    logger.debug(error, "Failed to update Facebook page")
    throw new ChatbotXException("Failed to update Facebook page")
  }
}

const getFieldsToDelete = (
  input: Pick<
    UpdateMessengerRequest,
    "persistentMenus" | "conversationStarters"
  >,
): string[] => {
  const fields: string[] = []
  if (!input.persistentMenus.length) {
    fields.push("PERSISTENT_MENU")
  }
  if (!input.conversationStarters.length) {
    fields.push("ICE_BREAKERS")
  }
  return fields
}

const parseFacebookButtons = (
  persistentMenus: MessengerPersistentMenu[],
): FacebookButton[] => {
  const buttons: FacebookButton[] = []
  for (const menu of persistentMenus) {
    if (menu.type === messengerPersistentMenuTypes.enum.flow) {
      buttons.push({
        type: "postback",
        title: menu.label,
        payload: encodeButtonPayload({
          flowId: menu.flowId,
        }),
      })
    } else if (menu.type === messengerPersistentMenuTypes.enum.url) {
      buttons.push({
        type: "web_url",
        title: menu.label,
        url: menu.url,
      })
    }
  }
  return buttons
}

const getMessengerProfileParams = (
  model: IntegrationMessengerModel,
): MessengerProfileRequest => {
  const params: MessengerProfileRequest = {}

  params.get_started = {
    payload: model.welcomeFlowId
      ? encodeButtonPayload({ flowId: model.welcomeFlowId })
      : "GET_STARTED",
  }

  if (model.persistentMenus.length) {
    const brandingUrl = getBrandingUrl("messenger")
    const menus = [...model.persistentMenus]
    const brandingIndex = menus.findIndex(
      (menu) =>
        menu.type === "url" && "url" in menu && menu.url === brandingUrl,
    )
    if (brandingIndex !== -1) {
      menus.push(...menus.splice(brandingIndex, 1))
    }
    const callToActions = parseFacebookButtons(menus)
    params.persistent_menu = [
      {
        locale: "default",
        composer_input_disabled: false,
        call_to_actions: callToActions,
      },
    ]
  }

  if (model.conversationStarters.length) {
    params.ice_breakers = model.conversationStarters.map((starter) => ({
      question: starter.question,
      payload: encodeButtonPayload({
        flowId: starter.flowId,
      }),
    }))
  }

  return params
}

const getPersonaId = async (
  workspace: WorkspaceModel,
  model: IntegrationMessengerModel,
  personas: MessengerPersona[],
): Promise<string | undefined> => {
  const defaultPersona = personas.find((persona) => persona.isDefault)

  const newPersona = await integrationMessenger.actions.updatePersona({
    ctx: {
      storagePrefix: getStoragePrefix(workspace.id, model.inboxId),
      uploader,
      auth: model?.auth as MessengerAuthValue,
    },
    persona: defaultPersona
      ? {
          name: defaultPersona.name,
          profile_picture_url: defaultPersona.profilePicture.url,
        }
      : undefined,
  })

  return newPersona.personaId
}
