import { customFieldService } from "@chatbotx.io/business"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingInFolder,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import {
  createCustomFieldRequest,
  updateCustomFieldRequest,
} from "../schema/action"
import {
  listCustomFieldsPublicRequest,
  listPublicCustomFieldsResponse,
} from "../schema/query"
import { publicCustomFieldDefinitionResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

const publicCustomFieldFolderId = zodBigintAsString()
  .nullish()
  .describe(
    'Folder id from `folders.list` (folderType "customField"). Pass null or "0" for the root.',
  )

const resolveFolderId = (folderId: string | null | undefined) =>
  !folderId || folderId === rootFolderId ? null : folderId

export const customFieldsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields",
      summary: "Get all custom fields",
      description:
        "Lists custom fields defined in the workspace with their id, type and folder, newest first unless `sort` is given. Filter by `name` (substring) or `folderId`. Use `contacts.setCustomField` to set values on a contact.",
      tags: ["Custom Fields"],
    })
    .input(listCustomFieldsPublicRequest)
    .output(listPublicCustomFieldsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await customFieldService.list({
        ...input,
        workspaceId: context.workspace.id,
        sort: input.sort ?? [{ id: "createdAt", desc: true }],
      })
      return result
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/custom-fields",
      summary: "Create custom field",
      description:
        "Defines a new custom field on the workspace with the given name and value type, optionally with a description and a folder.",
      successStatus: 201,
      tags: ["Custom Fields"],
    })
    .input(
      createCustomFieldRequest.extend({
        folderId: publicCustomFieldFolderId,
      }),
    )
    .output(publicCustomFieldDefinitionResource)
    .errors(possibleErrorsOnCreatingInFolder)
    .handler(
      async ({ context, input }) =>
        await customFieldService.create({
          workspaceId: context.workspace.id,
          data: { ...input, folderId: resolveFolderId(input.folderId) },
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/custom-fields/{idOrName}",
      summary: "Get custom field",
      description:
        "Returns one custom field's type and settings. Use `customFields.list` to find its id or name first.",
      tags: ["Custom Fields"],
    })
    .input(
      z.object({
        idOrName: z
          .string()
          .describe(
            "Custom field id or name. Get it from `customFields.list`.",
          ),
      }),
    )
    .output(publicCustomFieldDefinitionResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await customFieldService.findByKeyOrFail({
          key: input.idOrName,
          workspaceId: context.workspace.id,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/custom-fields/{id}",
      summary: "Update custom field",
      description:
        "Renames a custom field (`name` is required, send the current name to keep it) and updates its description; when `folderId` is given, moves it to that folder. The type cannot be changed. A name already used by another field returns 422. Use `customFields.list` to find its id first.",
      tags: ["Custom Fields"],
    })
    .input(
      updateCustomFieldRequest.extend({
        folderId: publicCustomFieldFolderId,
        id: zodBigintAsString().describe(
          "Custom field id. Get it from `customFields.list`.",
        ),
      }),
    )
    .output(publicCustomFieldDefinitionResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, folderId, ...rest } = input
      return await customFieldService.update(
        { workspaceId: context.workspace.id, id },
        {
          ...rest,
          ...(folderId === undefined
            ? {}
            : { folderId: resolveFolderId(folderId) }),
        },
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/custom-fields/{id}",
      summary: "Delete custom field",
      description:
        "Permanently deletes a custom field definition. Use `customFields.list` to find its id first.",
      successStatus: 204,
      tags: ["Custom Fields"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Custom field id. Get it from `customFields.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await customFieldService.delete({
          workspaceId: context.workspace.id,
          ids: [input.id],
        }),
    ),
}
