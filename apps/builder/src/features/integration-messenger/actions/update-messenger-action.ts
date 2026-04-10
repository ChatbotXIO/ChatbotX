"use server"

import { db, eq } from "@chatbotx.io/database/client"
import {
  type MessengerPersistentMenu,
  type MessengerPersona,
  persistentMenuType,
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
  const { addLanguage, ...rest } = parsedInput

  try {
    await db.transaction(async (tx) => {
      const integrationMessengerData = await findIntegrationMessenger({
        workspaceId: ctx.workspace.id,
        id: ctx.id,
      })
      const updatedPersonas = await updatePersonas(
        ctx.workspace,
        integrationMessengerData,
      )

      await tx
        .update(integrationMessengerModel)
        .set({
          ...rest,
          personas: updatedPersonas,
        })
        .where(eq(integrationMessengerModel.id, ctx.id))

      integrationMessenger.actions.updateMessengerProfile({
        ctx: {
          uploader,
          storagePrefix: getStoragePrefix(
            ctx.workspace.id,
            integrationMessengerData.inboxId,
          ),
          auth: integrationMessengerData?.auth as MessengerAuthValue,
        },
        params: await getMessengerProfileParams(integrationMessengerData),
      })

      revalidateCacheTags([`workspaces:${ctx.workspace.id}#messenger`])
    })
  } catch (error) {
    logger.debug(error, "Failed to update Facebook page")
    throw new ChatbotXException("Failed to update Facebook page")
  }
}

const parseFacebookButtons = (
  persistentMenus: MessengerPersistentMenu[],
): FacebookButton[] => {
  const buttons: FacebookButton[] = []
  for (const menu of persistentMenus) {
    if (menu.type === persistentMenuType.enum.flow) {
      buttons.push({
        type: "postback",
        title: menu.label,
        payload: encodeButtonPayload({
          flowId: menu.flowId,
        }),
      })
    } else if (menu.type === persistentMenuType.enum.url) {
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

  if (model.welcomeFlowId) {
    params.get_started = {
      payload: encodeButtonPayload({
        flowId: model.welcomeFlowId,
      }),
    }
  }

  if (model.greetingMessages.length) {
    params.greeting = model.greetingMessages
  }

  if (model.persistentMenus.length) {
    const callToActions = parseFacebookButtons(model.persistentMenus)
    params.persistent_menu = [
      {
        locale: "default",
        composer_input_disabled: false,
        call_to_actions: callToActions,
      },
    ]
  }

  if (model.conversationStarters.length) {
    params.ice_breakers = model.conversationStarters.map((starter) => {
      return {
        question: starter.question,
        payload: encodeButtonPayload({
          flowId: starter.flowId,
        }),
      }
    })
  }

  return params
}

const updatePersonas = async (
  workspace: WorkspaceModel,
  model: IntegrationMessengerModel,
): Promise<MessengerPersona[]> => {
  const defaultPersona = model.personas.find((persona) => persona.isDefault)

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

  return model.personas.map((persona) => {
    if (persona.isDefault && newPersona.personaId) {
      return {
        ...persona,
        facebookPersonaId: newPersona.personaId,
      }
    }
    return persona
  })
}
