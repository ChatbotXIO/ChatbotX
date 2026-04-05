import { findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
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
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const integrationWhatsapp = await findOrFail({
    table: integrationWhatsappModel,
    where: {
      workspaceId: input.workspaceId,
      id: input.id,
    },
    message: "Whatsapp integration not found",
  })

  return await listFlows({
    auth: integrationWhatsapp.auth as WhatsappAuthValue,
  })
}
