import { questionnaireSubmissionService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListQuestionnaireSubmissionsRequest } from "../schemas/query"

export async function listQuestionnaireSubmissions(
  input: ListQuestionnaireSubmissionsRequest,
) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await questionnaireSubmissionService.list({
    ...input,
    name: input.name ?? undefined,
    sort: input.sort,
  })
}
