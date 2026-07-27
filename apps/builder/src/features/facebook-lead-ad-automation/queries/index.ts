import { facebookLeadAdsAutomationService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListFacebookLeadAdsRequest,
  ListFacebookLeadAdsResponse,
} from "../schemas/query"

export async function listFacebookLeadAdsAutomations(
  input: ListFacebookLeadAdsRequest,
): Promise<ListFacebookLeadAdsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)
  return await facebookLeadAdsAutomationService.list(input)
}

export async function getFacebookLeadAdAutomation(
  workspaceId: string,
  id: string,
) {
  await assertCurrentUserCanAccessChatbot(workspaceId)
  const automation = await facebookLeadAdsAutomationService.findById({
    workspaceId,
    id,
  })
  if (!automation) {
    notFound()
  }
  return automation
}
