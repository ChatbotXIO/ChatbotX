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
  isRegisteredPersona,
  type MessengerProfileRequest,
  messengerMenusToCallToActions,
} from "@chatbotx.io/integration-messenger"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
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
      const syncedPersonas = await syncMessengerPersonas(
        ctx.workspace,
        integrationMessengerData,
        parsedInput.personas,
      )
      const defaultPersona = syncedPersonas.find((persona) => persona.isDefault)

      // A default persona that failed to register with Facebook has no
      // facebookPersonaId. Persisting personaId: null here would silently drop
      // the page's persona identity from every outbound message, so surface the
      // failure (rolls back the tx) instead of degrading to the generic page.
      if (defaultPersona && !isRegisteredPersona(defaultPersona)) {
        throw new ChatbotXException(
          "Couldn't register the default persona with Facebook. Please try saving again.",
        )
      }

      await tx
        .update(integrationMessengerModel)
        .set({
          ...parsedInput,
          personas: syncedPersonas,
          personaId: defaultPersona?.facebookPersonaId ?? null,
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
    // Preserve explicit, actionable messages (e.g. persona registration); only
    // unknown failures collapse to the generic message.
    if (error instanceof ChatbotXException) {
      throw error
    }
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

/**
 * Register the page's personas with Facebook and return the persona list with
 * each `facebookPersonaId` filled in.
 *
 * - Personas keep their stable local `id` (assigned here if missing for legacy
 *   rows). A persona whose name or profile picture changed has its
 *   `facebookPersonaId` cleared so Facebook recreates it (FB personas are
 *   immutable), since the recreated persona gets a new Facebook id.
 * - Personas removed from the list are deleted from Facebook by `syncPersonas`.
 */
const syncMessengerPersonas = async (
  workspace: WorkspaceModel,
  model: IntegrationMessengerModel,
  personas: MessengerPersona[],
): Promise<MessengerPersona[]> => {
  const oldById = new Map(
    model.personas.map((persona) => [persona.id, persona]),
  )

  // Authoritative local ids + carry-over Facebook ids derived from the stored
  // personas (never trust client-sent Facebook ids).
  const normalized: MessengerPersona[] = personas.map((persona) => {
    const id = persona.id || createId()
    const old = oldById.get(id)
    const unchanged =
      old &&
      old.name === persona.name &&
      old.profilePicture.url === persona.profilePicture.url
    return {
      ...persona,
      id,
      facebookPersonaId: unchanged ? old?.facebookPersonaId : undefined,
    }
  })

  const ctx = await buildContext({
    workspaceId: workspace.id,
    integrationType: "messenger",
    integration: {
      ...model,
      auth: model.auth as MessengerAuthValue,
    },
  })

  const { personas: synced } = await integrationMessenger.runAction(
    "syncPersonas",
    {
      ctx,
      personas: normalized.map((persona) => ({
        id: persona.id,
        name: persona.name,
        profilePictureUrl: persona.profilePicture.url,
        facebookPersonaId: persona.facebookPersonaId,
      })),
    },
  )

  const facebookIdById = new Map(
    synced.map((persona) => [persona.id, persona.facebookPersonaId]),
  )

  return normalized.map((persona) => ({
    ...persona,
    facebookPersonaId: facebookIdById.get(persona.id),
  }))
}
