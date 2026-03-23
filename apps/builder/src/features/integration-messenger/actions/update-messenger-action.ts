"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import {
  flowVersionModel,
  integrationMessengerModel,
} from "@aha.chat/database/schema"
import {
  type ChatbotModel,
  type FlowVersionModel,
  type IntegrationMessengerModel,
  PersistentMenuType,
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
import { findChatbotOrFail } from "@/features/chatbot/queries"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { chatbotActionClient } from "@/lib/safe-action"
import { findIntegrationMessenger } from "../queries"
import {
  type ConversationStarterSchema,
  type GreetingMessage,
  type PersistentMenuSchema,
  type Persona,
  type UpdateMessengerRequest,
  updateMessengerRequest,
} from "../schemas"

const messengerLocales = {
  en: "en_US",
  vi: "vi_VN",
}
export const updateMessengerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateMessengerRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      parsedInput: UpdateMessengerRequest
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      try {
        const { addLanguage, ...rest } = parsedInput

        await db.transaction(async (tx) => {
          const chatbot = await findChatbotOrFail({ id: chatbotId })
          const integrationMessengerData = await findIntegrationMessenger({
            id,
          })
          const updatedPersonas = await updatePersonas(
            chatbot,
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
              chatbot,
              // biome-ignore lint/suspicious/noExplicitAny: wip
              auth: integrationMessengerData?.auth as MessengerAuthValue,
            },
            params: await getMessengerProfileParams(integrationMessengerData),
          })

          revalidateCacheTags([`chatbots:${chatbotId}#messenger`])
        })
      } catch (_error) {
        throw new ChatbotXException("Failed to update Facebook page")
      }
    },
  )

const getMessengerProfileParams = async (
  model: IntegrationMessengerModel,
): Promise<MessengerProfileRequest> => {
  const params: MessengerProfileRequest = {}

  if (model.welcomeFlowId) {
    const flowVersion = await findOrFail<FlowVersionModel>(flowVersionModel, {
      flowId: model.welcomeFlowId,
      isLatest: true,
    })
    params.get_started = {
      payload: encodeButtonPayload({
        flowId: model.welcomeFlowId,
        flowVersionId: flowVersion.id,
        buttonId: "",
      }),
    }
  }

  if (model.greetingMessages.length) {
    params.greeting = model.greetingMessages.map((greeting) => {
      const g = greeting as GreetingMessage
      const locale =
        messengerLocales[g.language as keyof typeof messengerLocales] || "en_US"
      return {
        locale,
        text: g.text,
      }
    })
  }

  if (model.persistentMenus.length) {
    const callToActions = await parseFacebookButtons(model.persistentMenus)
    params.persistent_menu = [
      {
        locale: "default",
        composer_input_disabled: false,
        call_to_actions: callToActions,
      },
    ]
  }

  if (model.conversationStarters.length) {
    const conversationStarters =
      model.conversationStarters as ConversationStarterSchema[]
    params.ice_breakers = await Promise.all(
      conversationStarters.map(async (starter) => {
        const flowVersion = await findOrFail<FlowVersionModel>(
          flowVersionModel,
          { flowId: starter.flowId, isLatest: true },
        )
        return {
          question: starter.question,
          payload: encodeButtonPayload({
            flowId: starter.flowId,
            flowVersionId: flowVersion.id,
            buttonId: "",
          }),
        }
      }),
    )
  }

  return params
}

export const parseFacebookButtons = async (
  persistentMenus: IntegrationMessengerModel["persistentMenus"],
): Promise<FacebookButton[]> => {
  const buttons: FacebookButton[] = []
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

const updatePersonas = async (
  chatbot: ChatbotModel,
  model: IntegrationMessengerModel,
): Promise<Persona[]> => {
  const personas = model.personas as Persona[]
  const defaultPersona = personas.find((persona) => persona.isDefault)

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

  return personas.map((persona) => {
    if (persona.isDefault && newPersona.personaId) {
      return {
        ...persona,
        facebookPersonaId: newPersona.personaId,
      }
    }
    return persona
  })
}
