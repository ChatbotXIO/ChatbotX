import { automatedResponseService } from "@chatbotx.io/business"
import { automatedResponseTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { publicKeywordResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const keywordsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/keywords",
      summary: "List keywords (automated responses)",
      tags: ["Keywords"],
    })
    .input(
      publicListRequest.extend({
        type: automatedResponseTypes.default("inbound"),
      }),
    )
    .output(publicListResponse(publicKeywordResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { type, ...pagination } = input
      return await automatedResponseService.list({
        workspaceId: context.workspace.id,
        type,
        ...pagination,
        sort: [{ id: "createdAt", desc: true }],
        keyword: null,
        folderId: null,
      })
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/keywords/{id}",
      summary: "Get a keyword automation by id",
      tags: ["Keywords"],
    })
    .input(
      z.object({
        id: zodBigintAsString(),
        type: automatedResponseTypes.default("inbound"),
      }),
    )
    .output(publicKeywordResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await automatedResponseService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
          type: input.type,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/keywords",
      summary: "Create a keyword automation",
      successStatus: 201,
      tags: ["Keywords"],
    })
    .input(
      z.object({
        type: automatedResponseTypes.default("inbound"),
        keywords: z.array(z.string().min(1).max(255)).min(1),
        text: z.string().min(1).nullish(),
        flowId: zodBigintAsString().nullish(),
        folderId: zodBigintAsString().nullish(),
      }),
    )
    .output(publicKeywordResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await automatedResponseService.create(context.workspace.id, input),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/keywords/{id}",
      summary: "Update a keyword automation",
      tags: ["Keywords"],
    })
    .input(
      z.object({
        id: zodBigintAsString(),
        type: automatedResponseTypes.default("inbound"),
        keywords: z.array(z.string().min(1).max(255)).min(1).optional(),
        text: z.string().min(1).nullish(),
        flowId: zodBigintAsString().nullish(),
        folderId: zodBigintAsString().nullish(),
      }),
    )
    .output(publicKeywordResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, type, keywords, ...rest } = input
      return await automatedResponseService.update(
        { workspaceId: context.workspace.id, id, type },
        {
          ...rest,
          keywords: keywords?.map((value) => ({ value })),
        },
      )
    }),

  updateStatus: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/keywords/{id}/status",
      summary: "Enable or disable a keyword automation",
      tags: ["Keywords"],
    })
    .input(
      z.object({
        id: zodBigintAsString(),
        status: z.boolean(),
        type: automatedResponseTypes.default("inbound"),
      }),
    )
    .output(publicKeywordResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await automatedResponseService.findOrFail({
        workspaceId: context.workspace.id,
        id: input.id,
        type: input.type,
      })
      return await automatedResponseService.setStatus(
        { workspaceId: context.workspace.id, id: input.id, type: input.type },
        input.status,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/keywords/{id}",
      summary: "Delete a keyword automation",
      successStatus: 204,
      tags: ["Keywords"],
    })
    .input(
      z.object({
        id: zodBigintAsString(),
        type: automatedResponseTypes.default("inbound"),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await automatedResponseService.deleteMany(
        context.workspace.id,
        [input.id],
        input.type,
      )
    }),
}
