import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { integrations } from "@/integration"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { GetWhatsappIceBreakersSchema } from "../schemas/get-ice-breakers-schema"

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
      uploader,
    }

    const data = await integrations.WHATSAPP.actions?.getIceBreakers({
      ctx,
    })
    return { data }
  } catch (_err) {
    return { data: [] }
  }
}
