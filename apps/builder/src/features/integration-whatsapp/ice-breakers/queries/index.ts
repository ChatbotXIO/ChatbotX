import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { GetWhatsappIceBreakersSchema } from "../schemas/get-ice-breakers-schema"
import { prisma } from "@ahachat.ai/database"
import type { WhatsappAuthValue } from "@ahachat.ai/integration-whatsapp"
import { getLogger } from "@/lib/log"
import { uploader } from "@ahachat.ai/filesystem"
import { integrations } from "@/integration"

export const getWhatsappIceBreakers = async (
  input: GetWhatsappIceBreakersSchema,
): Promise<{
  data: string[]
}> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  try {
    const integrationWhatsapp =
      await prisma.integrationWhatsapp.findFirstOrThrow({
        where: {
          chatbotId: input.chatbotId,
        },
      })
    const ctx = {
      auth: integrationWhatsapp.auth as WhatsappAuthValue,
      logger: getLogger("whatsapp"),
      uploader,
    }

    const data =
      await integrations.WHATSAPP.integration.actions?.getIceBreakers({
        ctx,
      })
    return { data }
  } catch (_err) {
    return { data: [] }
  }
}
