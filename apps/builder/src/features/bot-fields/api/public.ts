import { botFieldService } from "@chatbotx.io/business"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import { createBotFieldRequest } from "../schema/action"
import { publicListBotFieldsResponse } from "../schema/query"
import { publicBotFieldResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const botFieldsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/bot-fields",
      summary: "Get all bot fields",
      description:
        "Use this to find bot field names before reading one with `botFields.get` or setting a value with `botFields.set`. Returns bot fields in this workspace.",
      tags: ["Bot Fields"],
    })
    .input(publicListRequest)
    .output(publicListBotFieldsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const result = await botFieldService.list({
        workspaceId: context.workspace.id,
        ...input,
        sort: [{ id: "createdAt", desc: true }],
        name: null,
        folderId: null,
      })
      return result
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/bot-fields",
      summary: "Create bot field",
      description:
        "Adds a custom bot field definition (a global variable available to every flow). Use `botFields.list` first to avoid duplicating an existing name.",
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

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/bot-fields/{idOrName}",
      summary: "Get bot field",
      description:
        "Returns one bot field's current value. Use `botFields.list` to find its id or name first.",
      tags: ["Bot Fields"],
    })
    .input(
      z.object({
        idOrName: z
          .string()
          .max(255)
          .describe("Bot field id or name. Get it from `botFields.list`."),
      }),
    )
    .output(publicBotFieldResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await botFieldService.findByKeyOrFail({
          key: input.idOrName,
          workspaceId: context.workspace.id,
        }),
    ),

  set: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/bot-fields/{idOrName}",
      summary: "Set bot field value",
      description:
        "Changes an existing bot field's value. Call `botFields.get` to inspect the current value first.",
      tags: ["Bot Fields"],
    })
    .input(
      z.object({
        idOrName: z
          .string()
          .max(255)
          .describe("Bot field id or name. Get it from `botFields.list`."),
        value: z.string().max(255).describe("New value for the bot field."),
      }),
    )
    .output(publicBotFieldResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { idOrName, ...rest } = input
      return await botFieldService.updateByKey({
        workspaceId: context.workspace.id,
        key: idOrName,
        data: rest,
      })
    }),

  setMany: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/bot-fields",
      summary: "Set multiple bot field values",
      description:
        "Changes several bot field values in one call, each entry addressed by id or name. Use `botFields.list` to find valid ids or names first.",
      successStatus: 204,
      tags: ["Bot Fields"],
    })
    .input(
      z.object({
        fields: z
          .array(
            z.union([
              z.object({
                id: z.coerce
                  .number()
                  .int()
                  .positive()
                  .describe("Bot field id. Get it from `botFields.list`."),
                value: z
                  .union([z.string(), z.number()])
                  .transform(String)
                  .describe("New value for the bot field."),
              }),
              z.object({
                name: z.string().max(255).describe("Bot field name."),
                value: z
                  .union([z.string(), z.number()])
                  .transform(String)
                  .describe("New value for the bot field."),
              }),
            ]),
          )
          .describe("Bot fields to update, each addressed by id or name."),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await botFieldService.bulkUpdateByKeys({
        workspaceId: context.workspace.id,
        updates: input.fields.map((field) => ({
          key: "id" in field ? String(field.id) : field.name,
          value: field.value,
        })),
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/bot-fields/{idOrName}",
      summary: "Unset bot field value",
      description:
        "Clears an existing bot field's value back to empty. Use `botFields.list` to find its id or name first.",
      successStatus: 204,
      tags: ["Bot Fields"],
    })
    .input(
      z.object({
        idOrName: z
          .string()
          .max(255)
          .describe("Bot field id or name. Get it from `botFields.list`."),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await botFieldService.deleteByKey({
          workspaceId: context.workspace.id,
          key: input.idOrName,
        }),
    ),
}
