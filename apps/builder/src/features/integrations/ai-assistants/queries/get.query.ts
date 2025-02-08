import { getCurrentUserId } from "@/auth"
import type { GetAiAssistantsSchema } from "@/features/integrations/ai-assistants/schemas/get.schema"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type AiAssistant, type Prisma, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export const getAiAssistants = async (
  input: GetAiAssistantsSchema,
): Promise<{
  data: AiAssistant[]
  pageCount: number
}> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.AiAssistantWhereInput = {
          chatbotId: input.chatbotId,
        }

        if (input.name) {
          where.AND = [
            {
              name: {
                contains: input.name,
                mode: "insensitive",
              },
            },
          ]
        }

        const orderBy = input.sort.map((sortItem) => ({
          [sortItem.id]: sortItem.desc ? "desc" : "asc",
        }))

        const [data, total] = await prisma.$transaction([
          prisma.aiAssistant.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
            orderBy,
          }),
          prisma.aiAssistant.count({ where }),
        ])

        const pageCount = Math.ceil(total / input.perPage)

        return { data, pageCount }
      } catch (err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#aiAssistants`],
    },
  )()
}

export const getAiAssistantFiles = async (
  input: Record<string, string>,
): Promise<{
  data: Record<string, string>[]
  status: string
}> => {
  const userId = await getCurrentUserId()
  // await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        return {
          data: [
            {
              id: "178120",
              external_id: "file-Xlt615JTrhehAkh2jCLTB266",
              name: "Câu hỏi thường gặp - FAQ.pdf",
              ext_vector_strore_id: "",
              created_at: "2024-11-11 10:26:39",
            },
            {
              id: "181962",
              external_id: "file-1uEUa1xhVuc75AQLGwXNZr",
              name: "wbn22012.png",
              ext_vector_strore_id: "",
              created_at: "2024-12-25 17:09:44",
            },
            {
              id: "244759",
              external_id: "file-B2N6hKQzDiyU5kMn1qmHox",
              name: "Brochure AhaChat - Ca Nhan.pdf",
              ext_vector_strore_id: "",
              created_at: "2024-12-25 17:10:07",
            },
          ],
          status: "ok",
        }
      } catch (err) {
        return { data: [], status: "error" }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#aiAssistants`],
    },
  )()
}
