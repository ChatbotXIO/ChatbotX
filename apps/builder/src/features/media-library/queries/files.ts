"use server"

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
import { env } from "@/env"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListFilesRequest, ListFilesResponse } from "../schemas"

export async function listMediaLibraryFiles(
  input: ListFilesRequest,
): Promise<ListFilesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

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

  const data = await db
    .select()
    .from(mediaLibraryFileModel)
    .where(and(...conditions))
    .orderBy(orderByColumn)
    .limit(input.filter === "recent" ? 50 : 200)

  return {
    data: data.map((file) => ({
      ...file,
      url: new URL(file.path, env.NEXT_PUBLIC_STORAGE_URL ?? "").toString(),
    })),
  }
}
