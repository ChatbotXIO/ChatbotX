import { questionnaireSubmissionService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export async function getQuestionnaireDashboardSummary(input: {
  workspaceId: string
  questionnaireId: string
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await questionnaireSubmissionService.dashboard(input)
}
