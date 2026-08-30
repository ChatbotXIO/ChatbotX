"use server"

import { resolveTenantSettings } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import {
  and,
  db,
  desc,
  eq,
  ilike,
  isNull,
  type SQL,
} from "@chatbotx.io/database/client"
import { mediaLibraryFileModel } from "@chatbotx.io/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  type ListFilesRequest,
  type ListFilesResponse,
  MEDIA_LIBRARY_FILES_PAGE_SIZE,
} from "../schema"

export async function listMediaLibraryFiles(
  input: ListFilesRequest,
): Promise<ListFilesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const { storageUrl } = await resolveTenantSettings({
    workspaceId: input.workspaceId,
  })

  const conditions: SQL[] = [
    eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
  ]

  if (input.filter === "favourite") {
    conditions.push(eq(mediaLibraryFileModel.isFavourite, true))
  } else if (input.folderId) {
    conditions.push(eq(mediaLibraryFileModel.folderId, input.folderId))
  } else if (!input.filter) {
    conditions.push(isNull(mediaLibraryFileModel.folderId))
  }

  if (input.search) {
    conditions.push(ilike(mediaLibraryFileModel.name, `%${input.search}%`))
  }

  const orderByColumn =
    input.filter === "recent"
      ? desc(mediaLibraryFileModel.lastAccessedAt)
      : desc(mediaLibraryFileModel.createdAt)

  const page = input.page ?? 1

  const data = await db
    .select()
    .from(mediaLibraryFileModel)
    .where(and(...conditions))
    .orderBy(orderByColumn)
    .limit(MEDIA_LIBRARY_FILES_PAGE_SIZE)
    .offset((page - 1) * MEDIA_LIBRARY_FILES_PAGE_SIZE)

  return {
    data: data.map((file) => ({
      ...file,
      url: getPublicFileUrl(file.path, storageUrl),
    })),
  }
}

/**
 * Confirms a storage path belongs to a Media Library file owned by the given
 * workspace, so a client-supplied path can't be used to reference another
 * workspace's (or otherwise arbitrary) storage object.
 */
export async function findMediaLibraryFileByPath(input: {
  workspaceId: string
  path: string
}) {
  const [file] = await db
    .select()
    .from(mediaLibraryFileModel)
    .where(
      and(
        eq(mediaLibraryFileModel.workspaceId, input.workspaceId),
        eq(mediaLibraryFileModel.path, input.path),
      ),
    )
    .limit(1)

  return file ?? null
}
