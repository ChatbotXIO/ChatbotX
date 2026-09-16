import {
  minigameContactService,
  minigameService,
} from "@chatbotx.io/business/minigame"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { bulkUpdateIdsRequest } from "@/features/common/schema"
import {
  possibleErrorsOnCreatingMinigame,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingMinigame,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createMinigamePublicRequest,
  listMinigamePlayersPublicRequest,
  listMinigamePlayersPublicResponse,
  listMinigamePlaysPublicRequest,
  listMinigamePlaysPublicResponse,
  listMinigamesPublicRequest,
  listMinigamesPublicResponse,
  minigamePublicResource,
  patchMinigamePublicRequest,
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
      description:
        "Use this to find minigame ids before inspecting one with `minigames.get` or listing its plays with `minigames.listPlays`. Returns minigames in this workspace.",
      tags,
    })
    .input(listMinigamesPublicRequest)
    .output(listMinigamesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await minigameService.list({
        ...input,
        workspaceId: context.workspace.id,
        sort: [{ id: "createdAt", desc: true }],
      })
      return { data: result.data, pageCount: result.pageCount }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/minigames/{id}",
      summary: "Get minigame",
      description:
        "Returns one minigame's configuration and prizes. Use `minigames.list` to find its id first.",
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Minigame id. Get it from `minigames.list`.",
        ),
      }),
    )
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
      summary: "Create minigame",
      description:
        "Adds a minigame (e.g. jackpot) that contacts can play through a flow step or public link. Use `minigames.list` first to avoid duplicating an existing one.",
      successStatus: 201,
      tags,
    })
    .input(createMinigamePublicRequest)
    .output(minigamePublicResource)
    .errors(possibleErrorsOnCreatingMinigame)
    .handler(
      async ({ context, input }) =>
        await minigameService.create({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/minigames/{id}",
      summary: "Update minigame",
      description:
        "Replaces an existing minigame's full configuration. Call `minigames.get` to inspect current values first.",
      tags,
    })
    .input(updateMinigamePublicRequest)
    .output(minigamePublicResource)
    .errors(possibleErrorsOnMutatingMinigame)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await minigameService.update({
        ...data,
        workspaceId: context.workspace.id,
        id,
        originalPrizeQuantities: null,
      })
    }),

  patch: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/minigames/{id}",
      summary: "Partially update minigame",
      description:
        "Changes only the given fields of an existing minigame, leaving the rest unchanged. Call `minigames.get` to inspect current values first.",
      tags,
    })
    .input(patchMinigamePublicRequest)
    .output(minigamePublicResource)
    .errors(possibleErrorsOnMutatingMinigame)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await minigameService.updatePartial({
        ...data,
        workspaceId: context.workspace.id,
        id,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/minigames/{id}",
      summary: "Delete minigame",
      description:
        "Permanently deletes a minigame and its configuration. Use `minigames.list` to find its id first.",
      successStatus: 204,
      tags,
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Minigame id. Get it from `minigames.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await minigameService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),

  deleteMany: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/minigames/bulk-delete",
      summary: "Delete multiple minigames",
      description:
        "Permanently deletes several minigames in one call. Use `minigames.list` to find their ids first.",
      successStatus: 204,
      tags,
    })
    .input(bulkUpdateIdsRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await minigameService.deleteMany({
        workspaceId: context.workspace.id,
        ids: input.ids,
      })
    }),

  setEnabled: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/minigames/{id}/enabled",
      summary: "Enable or disable minigame",
      description:
        "Toggles whether a minigame is playable without changing its configuration.",
      tags,
    })
    .input(setMinigameEnabledPublicRequest)
    .output(minigamePublicResource)
    .errors(possibleErrorsOnMutatingMinigame)
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
      summary: "List contact minigame play records",
      description:
        "Returns every play a specific contact made on a minigame, including prizes won. Use `minigames.list` to find the minigame id first.",
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

  listPlayers: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/minigames/{id}/players",
      summary: "List minigame players",
      description:
        "Returns contacts who have played a minigame, with their play counts and prizes. Use `minigames.list` to find the minigame id first.",
      tags,
    })
    .input(listMinigamePlayersPublicRequest)
    .output(listMinigamePlayersPublicResponse)
    // `minigameContactService.list` resolves the parent minigame through
    // `minigameService.find` first (MinigameContact has no workspaceId), so a
    // foreign or unknown id 404s.
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const { id, ...pagination } = input
      return await minigameContactService.list({
        ...pagination,
        workspaceId: context.workspace.id,
        minigameId: id,
      })
    }),
}
