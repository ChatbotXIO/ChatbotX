import { prisma } from "@aha.chat/database"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import {
  type ListFlowsResponse,
  listFlows,
} from "@aha.chat/integration-whatsapp/api/waba"
import type { ListWhatsappFlowsRequest } from "@/features/integration-whatsapp/flows/schemas/get-flows-schema"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"

export async function listWhatsappFlows(
  input: ListWhatsappFlowsRequest,
): Promise<ListFlowsResponse> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

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
