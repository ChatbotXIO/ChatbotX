"use server"

import { db } from "@chatbotx.io/database/client"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListFoldersRequest, ListFoldersResponse } from "../schemas"

export async function listMediaLibraryFolders(
  input: ListFoldersRequest,
): Promise<ListFoldersResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const data = await db.query.mediaLibraryFolderModel.findMany({
    where: { workspaceId: input.workspaceId },
    orderBy: (t, { asc }) => [asc(t.name)],
  })

  return { data }
}
