import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { automatedResponseService } from "../automated-response.service"
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
