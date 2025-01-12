import { auth, getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Chatbot, type Folder, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"

export const getAllChatbots = async (): Promise<{ data: Chatbot[] }> => {
  const session = await auth()
  console.log("sessionsessionsession", session)

  return { data: [] }

  // return await unstable_cache(
  //   async () => {
  //     try {
  //       const data = await prisma.chatbot.findMany({
  //         where: {
  //           workspaceId: user
  //         },
  //         orderBy: [
  //           {
  //             createdAt: "asc",
  //           },
  //         ],
  //       })

  //       return { data }
  //     } catch (err) {
  //       return { data: [] }
  //     }
  //   },
  //   [JSON.stringify(input)],
  //   {
  //     revalidate: 3600,
  //     tags: [`${userId}#folders#${input.folderType}`],
  //   },
  // )()
}
