import { type Prisma, prisma } from "@aha.chat/database"
import type { WhatsappMessageTemplateModel } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import type { GetMessageTemplatesSchema } from "@/features/integration-whatsapp/message-templates/schemas/get-message-templates-schema"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"

export const getMessageTemplates = async (
  input: GetMessageTemplatesSchema,
): Promise<{
  data: WhatsappMessageTemplateModel[]
  pageCount: number
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
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
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#whatsapp#messageTemplates`],
    },
  )()
}
