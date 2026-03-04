import { findOrFail } from "@aha.chat/database/client"
import { integrationWhatsappModel } from "@aha.chat/database/schema"
import type { IntegrationWhatsappModel } from "@aha.chat/database/types"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import {
  type ListFlowsResponse,
  listFlows,
} from "@aha.chat/integration-whatsapp/api/waba"
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
