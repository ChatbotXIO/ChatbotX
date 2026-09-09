"use server"

import { aiFileService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListAIFilesRequest, ListAIFilesResponse } from "../schema"

export async function listAIFiles(
  input: ListAIFilesRequest,
): Promise<ListAIFilesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return {
    data: await aiFileService.listWithEmbeddingStatus({
      workspaceId: input.workspaceId,
    }),
  }
}
