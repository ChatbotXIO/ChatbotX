import {
  minigameContactService,
  minigameService,
} from "@chatbotx.io/business/minigame"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createMinigamePublicRequest,
  listMinigamePlaysPublicRequest,
  listMinigamePlaysPublicResponse,
  listMinigamesPublicRequest,
  listMinigamesPublicResponse,
  minigamePublicResource,
  setMinigameEnabledPublicRequest,
  updateMinigamePublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("minigames")

const tags = ["Minigames"]

export const minigamesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/minigames",
      summary: "List minigames",
      tags,
    })
    .input(listMinigamesPublicRequest)
    .output(listMinigamesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await minigameService.list({
        ...input,
        workspaceId: context.workspace.id,
        name: input.name ?? undefined,
      })
      return { data: result.data, pageCount: result.pageCount }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/minigames/{id}",
      summary: "Get a minigame",
      tags,
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(minigamePublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await minigameService.find({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/minigames",
      summary: "Create a minigame",
      successStatus: 201,
      tags,
    })
    .input(createMinigamePublicRequest)
    .output(minigamePublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await minigameService.create({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/minigames/{id}",
      summary: "Update a minigame",
      tags,
    })
    .input(updateMinigamePublicRequest)
    .output(minigamePublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await minigameService.update({
        workspaceId: context.workspace.id,
        id,
        ...data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/minigames/{id}",
      summary: "Delete a minigame",
      successStatus: 204,
      tags,
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await minigameService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),

  setEnabled: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/minigames/{id}/enabled",
      summary: "Enable or disable a minigame",
      tags,
    })
    .input(setMinigameEnabledPublicRequest)
    .output(minigamePublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await minigameService.setEnabled(
          { workspaceId: context.workspace.id, id: input.id },
          input.enabled,
        ),
    ),

  listPlays: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/minigames/{id}/plays",
      summary: "List a contact's minigame play records",
      tags,
    })
    .input(listMinigamePlaysPublicRequest)
    .output(listMinigamePlaysPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const data = await minigameContactService.listPlays({
        workspaceId: context.workspace.id,
        minigameId: input.id,
        contactId: input.contactId,
      })
      return { data }
    }),
}
