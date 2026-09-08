import { folderService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  contactsFolderTypes,
  createFolderPublicRequest,
  listFoldersPublicRequest,
  listFoldersPublicResponse,
  updateFolderPublicRequest,
} from "../schema/public"
import { folderResource } from "../schema/resource"

// Folders are a generic organizing primitive shared across many resource
// types (tags, flows, custom fields, ...). This router is gated by the
// `contacts` token scope, so every request below is additionally restricted
// to `contactsFolderTypes` (tag, customField) — the folder types
// contacts-related tooling actually owns. Other folder types belong to
// their own scoped routers.
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
    .handler(async ({ context, input }) => {
      await requireContactsFolder({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      return await folderService.update({
        workspaceId: context.workspace.id,
        id: input.id,
        data: { name: input.name },
      })
    }),

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
      const folder = await requireContactsFolder({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      await folderService.bulkDelete({
        workspaceId: context.workspace.id,
        ids: [folder.id],
      })
    }),
}

// `folderService.update`/`bulkDelete` don't take a `folderType` filter, so
// scope both the "folder exists" 404 and the contacts-only restriction
// (I2/I3) through one findOrFail call that throws 404 either way — a
// non-contacts folderType looks like "not found" to a contacts-scoped token,
// consistent with least-privilege.
async function requireContactsFolder(props: {
  workspaceId: string
  id: string
}) {
  const folder = await folderService.findOrFail({
    workspaceId: props.workspaceId,
    id: props.id,
  })
  if (!contactsFolderTypes.options.includes(folder.folderType as never)) {
    throw notFoundException("Folder not found")
  }
  return folder
}
