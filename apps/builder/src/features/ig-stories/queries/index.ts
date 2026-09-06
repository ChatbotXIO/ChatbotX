import { igStoryAutomationService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListIgStoriesRequest,
  ListIgStoriesResponse,
} from "../schema/action"

export async function listIgStories(
  input: ListIgStoriesRequest,
): Promise<ListIgStoriesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await igStoryAutomationService.list(input)
}

export async function getIgStory(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return await igStoryAutomationService.findOrFail({ workspaceId, id })
}
