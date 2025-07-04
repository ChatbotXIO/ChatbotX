import { getCurrentUserId } from "@/auth"
import type { GetWhatsappFlowsSchema } from "@/features/integration-whatsapp/flows/schemas/get-flows-schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Prisma, prisma } from "@ahachat.ai/database"
import type {
  WhatsappFlowModel,
  WhatsappFlowStatus,
} from "@ahachat.ai/database/types"
import { unstable_cache } from "next/cache"

export const getWhatsappFlows = async (
  input: GetWhatsappFlowsSchema,
): Promise<{
  data: WhatsappFlowModel[]
  pageCount: number
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      let where: Prisma.WhatsappFlowWhereInput = {
        integrationWhatsapp: {
          is: {
            chatbotId: input.chatbotId,
          },
        },
      }
      if (input.status) {
        where = {
          ...where,
          status: input.status as WhatsappFlowStatus,
        }
      }
      const [data, total] = await prisma.$transaction([
        prisma.whatsappFlow.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
        }),
        prisma.whatsappFlow.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#whatsapp#flows`],
    },
  )()
}
