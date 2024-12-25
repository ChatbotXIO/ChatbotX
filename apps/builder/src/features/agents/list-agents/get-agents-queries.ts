"use server";
import { getCurrentUserId } from "@/auth";
import { GetAgentsSchema } from "./get-agents-schema";
import { unstable_cache } from "next/cache";
import { ChatbotMember, Prisma } from "@prisma/client";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma } from "@ahachat.ai/database";


export async function getAgents(
  input: GetAgentsSchema
): Promise<{ data: ChatbotMember[]; pageCount: number }> {
  const userId = await getCurrentUserId();

  await findChatbotOrFail(userId, input.chatbotId);

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.ChatbotMemberWhereInput = {
          chatbotId: input.chatbotId,
        };

        const [data, total] = await prisma.$transaction([
          prisma.chatbotMember.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
            include:{
              user:true
            }
          }),
          prisma.chatbotMember.count({ where }),
        ]);

        const pageCount = Math.ceil(total / input.perPage);

        console.log("Fetched data:", { data, pageCount });
        return { data, pageCount };
      } catch (error) {
        console.error("Error fetching chatbot members:", error);
        return { data: [], pageCount: 0 };
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: ["agents"],
    }
  )();
}
