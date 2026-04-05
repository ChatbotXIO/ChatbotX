import { db } from "@chatbotx.io/database/client"
import { type FolderType, rootFolderId } from "@chatbotx.io/database/partials"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetCurrentFolderSchema,
  ListFoldersSearchParams,
} from "../schema/query"
import type { FolderResource, ListFoldersResponse } from "../schema/resource"

export const listFolders = async (
  input: ListFoldersSearchParams,
): Promise<{ data: ListFoldersResponse["data"] }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const { folderId, ...rest } = input

  const data = await db.query.folderModel.findMany({
    where: {
      ...rest,
      folderType: rest.folderType as FolderType,
      parentId: folderId
        ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
          folderId === rootFolderId
          ? { isNull: true as const }
          : folderId
        : undefined,
    },
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}

export const getCurrentFolder = async (
  input: GetCurrentFolderSchema,
): Promise<{ folder: FolderResource | null; parents: FolderResource[] }> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const folder = await db.query.folderModel.findFirst({
    where: input,
  })
  if (!folder) {
    return { folder: null, parents: [] }
  }

  let parents: FolderResource[] = []
  if (folder.paths.length > 0) {
    const tempParents = await db.query.folderModel.findMany({
      where: {
        id: { in: folder.paths },
      },
    })

    // Sort by path's order
    const orderedPaths = folder.paths.reduce(
      (result, value) => {
        result[value.toString()] = null
        return result
      },
      {} as Record<string, FolderResource | null>,
    )

    for (const temp of tempParents) {
      orderedPaths[temp.id.toString()] = temp
    }

    // Remove null value
    parents = Object.values(orderedPaths).filter(
      (v) => v?.id,
    ) as FolderResource[]
  }

  return { folder, parents }
}
