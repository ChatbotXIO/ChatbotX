import { botFieldService } from "@chatbotx.io/business"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
} from "@/lib/orpc/orpc-error-helper"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createBotFieldRequest } from "../schema/action"
import { publicListBotFieldsResponse } from "../schema/query"
import { publicBotFieldResource } from "../schema/resource"

const botFieldWorkspaceTokenAPIs = {
  listBotFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/bot-fields",
      summary: "Get all bot fields",
      tags: ["Bot Fields"],
    })
    .input(z.object({}))
    .output(publicListBotFieldsResponse)
    .errors(possibleErrorsOnFindingResource)
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
      summary: "Create a new bot field",
      successStatus: 201,
      tags: ["Bot Fields"],
    })
    .input(createBotFieldRequest)
    .output(publicBotFieldResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await botFieldService.create({
          workspaceId: context.workspace.id,
          data: input,
        }),
    ),

  getBotFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/bot-fields/{idOrName}",
      summary: "Get bot field by id or name",
      tags: ["Bot Fields"],
    })
    .input(z.object({ idOrName: z.string().max(255) }))
    .output(publicBotFieldResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await botFieldService.findByKeyOrFail({
          key: input.idOrName,
          workspaceId: context.workspace.id,
        }),
    ),

  setBotFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/bot-fields/{idOrName}",
      summary: "Set bot field value by id or name",
      tags: ["Bot Fields"],
    })
    .input(
      z.object({ idOrName: z.string().max(255), value: z.string().max(255) }),
    )
    .output(publicBotFieldResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { idOrName, ...rest } = input
      return await botFieldService.updateByKey({
        workspaceId: context.workspace.id,
        key: idOrName,
        data: rest,
      })
    }),

  setBotFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/bot-fields",
      summary: "Set multiple bot field values",
      successStatus: 204,
      tags: ["Bot Fields"],
    })
    .input(
      z.object({
        fields: z.array(
          z.object({ key: z.string().max(255), value: z.string().max(255) }),
        ),
      }),
    )
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      await Promise.all(
        input.fields.map(({ key, value }) =>
          botFieldService.updateByKey({
            workspaceId: context.workspace.id,
            key,
            data: { value },
          }),
        ),
      )
    }),

  bulkUpdateBotFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/bot-fields/bulk-update",
      summary: "Bulk update bot field values by id or name",
      successStatus: 204,
      tags: ["Bot Fields"],
    })
    .input(
      z.object({
        fields: z.array(
          z.union([
            z.object({
              id: z.coerce.number().int().positive(),
              value: z.union([z.string(), z.number()]).transform(String),
            }),
            z.object({
              name: z.string().max(255),
              value: z.union([z.string(), z.number()]).transform(String),
            }),
          ]),
        ),
      }),
    )
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      await botFieldService.bulkUpdateByKeys({
        workspaceId: context.workspace.id,
        updates: input.fields.map((field) => ({
          key: "id" in field ? String(field.id) : field.name,
          value: field.value,
        })),
      })
    }),

  deleteBotFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/bot-fields/{idOrName}",
      summary: "Unset the value of the bot field by id or name",
      successStatus: 204,
      tags: ["Bot Fields"],
    })
    .input(z.object({ idOrName: z.string().max(255) }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await botFieldService.deleteByKey({
          workspaceId: context.workspace.id,
          key: input.idOrName,
        }),
    ),
}

export default botFieldWorkspaceTokenAPIs
