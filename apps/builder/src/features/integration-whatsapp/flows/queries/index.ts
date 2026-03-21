import { findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  type ListFlowsResponse,
  listFlows,
} from "@chatbotx.io/integration-whatsapp/api/waba"
import type { ListWhatsappFlowsRequest } from "@/features/integration-whatsapp/flows/schemas/get-flows-schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export async function listWhatsappFlows(
  input: ListWhatsappFlowsRequest,
): Promise<ListFlowsResponse> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const integrationWhatsapp = await findOrFail<IntegrationWhatsappModel>(
    integrationWhatsappModel,
    {
      chatbotId: input.chatbotId,
      id: input.id,
    },
    "Whatsapp integration not found",
  )

  return await listFlows({
    auth: integrationWhatsapp.auth as WhatsappAuthValue,
  })
}
