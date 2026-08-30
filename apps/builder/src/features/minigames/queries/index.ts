import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  minigameContactService,
  minigameService,
} from "@chatbotx.io/business/minigame"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListMinigameHistoryRequest,
  ListMinigamesRequest,
  ListMinigamesResponse,
} from "../schema/query"
import type { MinigameResource } from "../schema/resource"

export async function listMinigames(
  input: ListMinigamesRequest,
): Promise<ListMinigamesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await minigameService.list({
    ...input,
    name: input.name ?? undefined,
  })
}

export async function listMinigameHistory(input: ListMinigameHistoryRequest) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await minigameContactService.list({
    ...input,
    name: input.name ?? undefined,
  })
}

export async function findMinigame(where: {
  workspaceId: string
  id: string
}): Promise<MinigameResource | undefined> {
  await assertCurrentUserCanAccessChatbot(where.workspaceId)

  try {
    return await minigameService.find(where)
  } catch (error) {
    if (error instanceof ChatbotXException && error.code === "notFound") {
      return
    }
    throw error
  }
}
