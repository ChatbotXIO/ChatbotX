import { questionnaireService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListQuestionnairesRequest } from "../schema/query"

export async function listQuestionnaires(input: ListQuestionnairesRequest) {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await questionnaireService.list({
    ...input,
    name: input.name ?? undefined,
  })
}
