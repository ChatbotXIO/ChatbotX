import { automatedResponseService } from "@chatbotx.io/business"
import type { PaginatedResponse } from "@/features/common/schema/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindAutomatedResponseRequest,
  ListAutomatedResponsesRequest,
} from "../schema/query"
import type { AutomatedResponseResource } from "../schema/resource"

export async function listAutomatedResponses(
  input: ListAutomatedResponsesRequest,
): Promise<PaginatedResponse<AutomatedResponseResource>> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return automatedResponseService.list(input)
}

export const findAutomatedResponse = async (
  input: FindAutomatedResponseRequest,
): Promise<AutomatedResponseResource | undefined> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return automatedResponseService.findBy(input)
}
