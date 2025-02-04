import type { GetAiAssistantsSchema } from "@/features/integrations/ai-assistants/schemas/get.schema"
import { AiAssistant, prisma, Prisma } from "@ahachat.ai/database"
import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
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

export const findAIAssistant = async ({
  id,
}: { id: string }): Promise<{
  data: Record<
    string,
    | string
    | number
    | Record<
        string,
        | string
        | number
        | boolean
        | null
        | string[]
        | Record<string, string | boolean>
      >
    | null
    | undefined
  >
  status: string
}> => {
  return {
    data: {
      id: "1067356",
      name: "dddd",
      external_id: "asst_UMKktMjnElmhtd29Jm6Ab1SG",
      json_builder: {
        version: "3",
        name: "dddd",
        model: "gpt-3.5-turbo",
        description: null,
        temperature: 1,
        instructions: "You are a helpful assistant.eeeeee",
        file_ids: [],
        functions: ["1"],
        autoVoice: {
          enable: true,
          voice: "alloy",
        },
      },
      version: "3",
      vector_store_id: "",
    },
    status: "ok",
  }
}
