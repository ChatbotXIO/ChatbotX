import { prisma } from "@aha.chat/database"
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

  const integrationWhatsapp =
    await prisma.integrationWhatsapp.findUniqueOrThrow({
      where: {
        chatbotId: input.chatbotId,
        id: input.id,
      },
    })

  return await listFlows({
    auth: integrationWhatsapp.auth as WhatsappAuthValue,
  })
}
