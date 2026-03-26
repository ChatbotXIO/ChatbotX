"use server"

import { db, eq } from "@aha.chat/database/client"
import {
  integrationMessengerModel,
  type MessengerPersistentMenu,
  type MessengerPersona,
  persistentMenuType,
} from "@aha.chat/database/schema"
import type {
  ChatbotModel,
  IntegrationMessengerModel,
} from "@aha.chat/database/types"
import { encodeButtonPayload } from "@aha.chat/flow-config"
import {
  integration as integrationMessenger,
  type MessengerProfileRequest,
} from "@aha.chat/integration-messenger"
import type {
  FacebookButton,
  MessengerAuthValue,
} from "@aha.chat/integration-messenger/schemas"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { logger } from "@/lib/log"
import { chatbotActionClient } from "@/lib/safe-action"
import { findIntegrationMessenger } from "../queries"
import { type UpdateMessengerRequest, updateMessengerRequest } from "../schemas"

export const updateMessengerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateMessengerRequest)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      ctx: { chatbot: ChatbotModel }
      parsedInput: UpdateMessengerRequest
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const { addLanguage, ...rest } = parsedInput

      try {
        await db.transaction(async (tx) => {
          const integrationMessengerData = await findIntegrationMessenger({
            chatbotId: ctx.chatbot.id,
            id,
          })
          const updatedPersonas = await updatePersonas(
            ctx.chatbot,
            integrationMessengerData,
          )

          await tx
            .update(integrationMessengerModel)
            .set({
              ...rest,
              personas: updatedPersonas,
            })
            .where(eq(integrationMessengerModel.id, id))

          integrationMessenger.actions.updateMessengerProfile({
            ctx: {
              chatbot: ctx.chatbot,
              auth: integrationMessengerData?.auth as MessengerAuthValue,
            },
            params: await getMessengerProfileParams(integrationMessengerData),
          })

          revalidateCacheTags([`chatbots:${chatbotId}#messenger`])
        })
      } catch (error) {
        logger.debug(error, "Failed to update Facebook page")
        throw new ChatbotXException("Failed to update Facebook page")
      }
    },
  )

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
    } else if (menu.type === persistentMenuType.enum.website) {
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
  chatbot: ChatbotModel,
  model: IntegrationMessengerModel,
): Promise<MessengerPersona[]> => {
  const defaultPersona = model.personas.find((persona) => persona.isDefault)

  const newPersona = await integrationMessenger.actions.updatePersona({
    ctx: {
      chatbot,
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
