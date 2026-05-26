import { botFieldService } from "@chatbotx.io/business"
import z from "zod"
import {
  posibleErrorsOnCreatingResource,
  posibleErrorsOnDeletingResource,
  posibleErrorsOnFindingResource,
} from "@/lib/orpc/orpc-error-helper"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createBotFieldRequest } from "../schemas/action"
import { publicListBotFieldsResponse } from "../schemas/query"
import { publicBotFieldResource } from "../schemas/resource"

const botFieldWorkspaceTokenAPIs = {
  listBotFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/bot-fields",
      summary: "Obter todos os campos do bot",
      tags: ["Campos do Bot"],
    })
    .input(z.object({}))
    .output(publicListBotFieldsResponse)
    .errors(posibleErrorsOnFindingResource)
    .handler(async ({ context }) => {
      const result = await botFieldService.list({
        workspaceId: context.workspace.id,
        page: 1,
        perPage: maxPerPage,
        sort: [{ id: "createdAt", desc: true }],
        name: null,
        folderId: null,
      })
      return { data: result.data }
    }),

  createBotFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/bot-fields",
      summary: "Criar novo campo do bot",
      successStatus: 201,
      tags: ["Campos do Bot"],
    })
    .input(createBotFieldRequest)
    .output(publicBotFieldResource)
    .errors(posibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await botFieldService.create({
          workspaceId: context.workspace.id,
          data: input,
        }),
    ),

  searchBotFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/bot-fields/{key}",
      summary: "Buscar campo do bot por ID ou nome",
      tags: ["Campos do Bot"],
    })
    .input(z.object({ key: z.string().max(255) }))
    .output(publicBotFieldResource)
    .errors(posibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await botFieldService.findByKeyOrFail({
          key: input.key,
          workspaceId: context.workspace.id,
        }),
    ),

  updateBotFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/bot-fields/{key}",
      summary: "Atualizar campo do bot por ID ou nome",
      tags: ["Campos do Bot"],
    })
    .input(z.object({ key: z.string().max(255), value: z.string().max(255) }))
    .output(publicBotFieldResource)
    .errors(posibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { key, ...rest } = input
      return await botFieldService.updateByKey({
        workspaceId: context.workspace.id,
        key,
        data: rest,
      })
    }),

  deleteBotFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/bot-fields/{key}",
      summary: "Limpar valor do campo do bot por ID ou nome",
      successStatus: 204,
      tags: ["Campos do Bot"],
    })
    .input(z.object({ key: z.string().max(255) }))
    .errors(posibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await botFieldService.deleteByKey({
          workspaceId: context.workspace.id,
          key: input.key,
        }),
    ),
}

export default botFieldWorkspaceTokenAPIs
