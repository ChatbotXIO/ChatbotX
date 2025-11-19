import type { ChatbotModel, OrganizationModel } from "@aha.chat/database/types"
import { headers } from "next/headers"
import { findChatbot } from "../chatbot/queries"
import { findOrganization } from "../organization/queries"

export async function identifyChatbotAndOrganizationFromRequest(
  chatbotId?: string | null,
): Promise<{ chatbot?: ChatbotModel; organization: OrganizationModel }> {
  const headersList = await headers()
  const baseUrl = new URL(headersList.get("x-url") ?? "")

  const organization = await findOrganization({
    domain: baseUrl.hostname,
  })
  if (!organization) {
    throw new Error("Organization not found")
  }

  if (!chatbotId) {
    return { organization }
  }

  const chatbot = await findChatbot({
    id: chatbotId,
    organizationId: organization.id,
  })
  if (!chatbot) {
    throw new Error("Chatbot not found")
  }

  return { chatbot, organization }
}
