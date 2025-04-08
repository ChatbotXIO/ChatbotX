import {
  type Prisma,
  prisma,
  type WhatsappMessageTemplate,
} from "@ahachat.ai/database"
import type { GetMessageTemplatesSchema } from "@/features/integration-whatsapp/message-templates/schemas/get-message-templates-schema"
import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { unstable_cache } from "next/cache"

export const getMessageTemplates = async (
  input: GetMessageTemplatesSchema,
): Promise<{
  data: WhatsappMessageTemplate[]
  pageCount: number
}> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.WhatsappMessageTemplateWhereInput = {
          integrationWhatsapp: {
            is: {
              chatbotId: input.chatbotId,
            },
          },
        }
        const [data, total] = await prisma.$transaction([
          prisma.whatsappMessageTemplate.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
          }),
          prisma.whatsappMessageTemplate.count({ where }),
        ])

        const pageCount = Math.ceil(total / input.perPage)

        return { data, pageCount }
      } catch (_err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#whatsapp#messageTemplates`],
    },
  )()
}
