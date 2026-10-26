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

export async function getAIFile(input: { workspaceId: string; id: string }) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await aiFileService.findWithProcessing({
    where: { id: input.id, workspaceId: input.workspaceId },
  })
}
