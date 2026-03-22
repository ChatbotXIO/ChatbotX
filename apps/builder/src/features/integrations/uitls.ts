import type { ChatbotModel, OrganizationModel } from "@aha.chat/database/types"
import { getDomainFromHeader } from "@/lib/domain"
import { findChatbotOrFail } from "../chatbot/queries"
import { findOrganization } from "../organization/queries"

export async function identifyChatbotAndOrganizationFromRequest(
  chatbotId?: string | null,
): Promise<{ chatbot?: ChatbotModel; organization: OrganizationModel }> {
  const domain = await getDomainFromHeader()
  const organization = await findOrganization({
    domain,
  })
  if (!organization) {
    throw new Error("Organization not found")
  }

  if (!chatbotId) {
    return { organization }
  }

  const chatbot = await findChatbotOrFail({
    id: chatbotId,
    organizationId: organization.id,
  })

  return { chatbot, organization }
}
