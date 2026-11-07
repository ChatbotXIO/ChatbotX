import { ChatbotXException } from "@chatbotx.io/business/errors"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { pollOperations } from "../lib/operations"

export async function listPolls(input: {
  workspaceId: string
  page: number
  perPage: number
  name: string | null
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await pollOperations.list({
    ...input,
    name: input.name ?? undefined,
  })
}

export async function findPoll(input: { workspaceId: string; id: string }) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  try {
    return await pollOperations.get(input)
  } catch (error) {
    // Only "no such poll" is a 404; a DB or service failure must surface.
    if (error instanceof ChatbotXException && error.httpStatusCode === 404) {
      return
    }
    throw error
  }
}
