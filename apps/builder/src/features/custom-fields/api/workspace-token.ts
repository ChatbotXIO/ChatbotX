import { findOrFail } from "@chatbotx.io/database/client"
import { customFieldModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { notFoundException } from "@/lib/errors/exception"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createCustomField } from "../actions/create-custom-field.action"
import { findCustomField, listCustomFields } from "../queries"
import { createCustomFieldRequest } from "../schemas/action"
import { publicCustomFieldResource } from "../schemas/resource"

const customFieldsWorkspaceTokenAPI = {
  listCustomFieldsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields",
      summary: "Get all custom fields",
      tags: ["Custom Fields"],
    })
    .input(z.object({}))
    .output(z.object({ data: z.array(publicCustomFieldResource) }))
    .handler(async ({ context, input }) => {
      return await listCustomFields({
        ...input,
        workspaceId: context.workspace.id,
      })
    }),

  createCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/custom-fields",
      summary: "Create a custom field",
      tags: ["Custom Fields"],
    })
    .input(createCustomFieldRequest.pick({ name: true, type: true }))
    .output(publicCustomFieldResource)
    .handler(async ({ context, input }) => {
      return await createCustomField(context.workspace.id, input)
    }),

  findCustomFieldWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields/{id}",
      summary: "Get custom field by id",
      tags: ["Custom Fields"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicCustomFieldResource)
    .handler(async ({ context, input }) => {
      const customField = await findCustomField({
        id: input.id,
        workspaceId: context.workspace.id,
      })
      if (!customField) {
        throw notFoundException("Custom field not found")
      }
      return customField
    }),

  findCustomFieldByNameWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields/name/{name}",
      summary: "Get custom field by name",
      tags: ["Custom Fields"],
    })
    .input(z.object({ name: z.string() }))
    .output(publicCustomFieldResource)
    .handler(async ({ context, input }) => {
      const customField = await findOrFail({
        table: customFieldModel,
        where: {
          workspaceId: context.workspace.id,
          name: input.name,
        },
        message: "Custom field not found",
      })
      return customField
    }),
}

export default customFieldsWorkspaceTokenAPI
