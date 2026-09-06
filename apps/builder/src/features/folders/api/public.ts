import { folderService } from "@chatbotx.io/business"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createFolderPublicRequest,
  listFoldersPublicRequest,
  listFoldersPublicResponse,
  updateFolderPublicRequest,
} from "../schema/public"
import { folderResource } from "../schema/resource"

// Folders are a generic organizing primitive shared across many resource
// types (tags, flows, custom fields, ...) — the router scope is chosen once
// here, not per `folderType`, since `workspaceTokenAuthAPIForScope` is a
// compile-time router decoration. `contacts` fits since tags/custom-fields
// (the folder types contacts-related tooling actually uses) already live on
// that scope; flows/sequences/etc. folders are reachable here too, but a
// stricter per-type gate would need a separate change to `requireTokenScope`.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const foldersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/folders",
      summary: "List folders of a given type",
      description:
        'Lists folders for one `folderType` (e.g. `"tag"`, `"customField"`, `"flow"`). Omit `parentId` for top-level folders.',
      tags: ["Folders"],
    })
    .input(listFoldersPublicRequest)
    .output(listFoldersPublicResponse)
    .handler(async ({ context, input }) => {
      const data = await folderService.list({
        workspaceId: context.workspace.id,
        folderType: input.folderType,
        parentId: input.parentId ?? null,
      })
      return { data }
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/folders",
      summary: "Create a folder",
      tags: ["Folders"],
    })
    .input(createFolderPublicRequest)
    .output(folderResource)
    .handler(async ({ context, input }) => {
      const parentId =
        input.parentId && input.parentId !== rootFolderId
          ? input.parentId
          : null
      return await folderService.create({
        workspaceId: context.workspace.id,
        data: {
          name: input.name,
          folderType: input.folderType,
          parentId,
        },
      })
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/folders/{id}",
      summary: "Rename a folder",
      tags: ["Folders"],
    })
    .input(updateFolderPublicRequest)
    .output(folderResource)
    .handler(
      async ({ context, input }) =>
        await folderService.update({
          workspaceId: context.workspace.id,
          id: input.id,
          data: { name: input.name },
        }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/folders/{id}",
      summary: "Delete a folder",
      successStatus: 204,
      tags: ["Folders"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .handler(async ({ context, input }) => {
      await folderService.bulkDelete({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),
}
