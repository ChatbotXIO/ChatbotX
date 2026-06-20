"use server"

import { buildContext } from "@chatbotx.io/business"
import { moveBrandingMenuLast } from "@chatbotx.io/business/branding"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq } from "@chatbotx.io/database/client"
import type { MessengerPersona } from "@chatbotx.io/database/partials"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"
import type {
  IntegrationMessengerModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { encodeButtonPayload } from "@chatbotx.io/flow-config"
import {
  integration as integrationMessenger,
  type MessengerProfileRequest,
  messengerMenusToCallToActions,
} from "@chatbotx.io/integration-messenger"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getBrandingUrl } from "@/features/integration-webchat/lib"
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

      const botContext = await buildContext({
        workspaceId: ctx.workspace.id,
        integrationType: "messenger",
        integration: {
          ...integrationMessengerData,
          auth: integrationMessengerData.auth as MessengerAuthValue,
        },
      })

      const fieldsToDelete = getFieldsToDelete(parsedInput)
      if (fieldsToDelete.length > 0) {
        await integrationMessenger.runChannelHandler(
          "bot",
          "deleteProfileFields",
          {
            ctx: botContext,
            fields: fieldsToDelete,
          },
        )
      }

      const profileParams = getMessengerProfileParams(
        {
          ...integrationMessengerData,
          ...parsedInput,
        },
        botContext.platform.appUrl,
      )
      if (Object.keys(profileParams).length > 0) {
        await integrationMessenger.runChannelHandler("bot", "updateProfile", {
          ctx: botContext,
          data: profileParams,
        })
      }
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

const getMessengerProfileParams = (
  model: IntegrationMessengerModel,
  appUrl: string,
): MessengerProfileRequest => {
  const params: MessengerProfileRequest = {}

  params.get_started = {
    payload: model.welcomeFlowId
      ? encodeButtonPayload({ flowId: model.welcomeFlowId })
      : "GET_STARTED",
  }

  if (model.persistentMenus.length) {
    const brandingUrl = getBrandingUrl("messenger", appUrl)
    const menus = moveBrandingMenuLast(model.persistentMenus, brandingUrl)
    const callToActions = messengerMenusToCallToActions(menus)
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

  const ctx = await buildContext({
    workspaceId: workspace.id,
    integrationType: "messenger",
    integration: {
      ...model,
      auth: model.auth as MessengerAuthValue,
    },
  })
  const newPersona = await integrationMessenger.runAction("updatePersona", {
    ctx,
    persona: defaultPersona
      ? {
          name: defaultPersona.name,
          profile_picture_url: defaultPersona.profilePicture.url,
        }
      : undefined,
  })

  return newPersona.personaId
}
