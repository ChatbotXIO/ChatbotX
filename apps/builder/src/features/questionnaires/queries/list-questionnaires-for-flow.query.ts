import { questionnaireService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export async function listQuestionnairesForFlow(input: {
  workspaceId: string
  keyword?: string
}) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await questionnaireService.listForFlow(input)
}
