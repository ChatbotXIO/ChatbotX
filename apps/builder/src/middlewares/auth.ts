import { db } from "@aha.chat/database/client"
import { ORPCError } from "@orpc/server"
import { auth } from "@/lib/auth/auth"
import { base } from "./context"

export const authMiddleware = base.middleware(async ({ context, next }) => {
  const sessionData = await auth.api.getSession({
    headers: context.headers,
  })

  if (!(sessionData?.session && sessionData?.user)) {
    throw new ORPCError("UNAUTHORIZED")
  }

  // Adds session and user to the context
  return next({
    context: {
      session: sessionData.session,
      user: {
        ...sessionData.user,
        image: sessionData.user.image || null,
        isAnonymous: sessionData.user.isAnonymous ?? false,
        // stripeCustomerId: sessionData.user.stripeCustomerId || null,
      },
    },
  })
})

export const chatbotAuthMiddleware = base.middleware(
  async ({ context, next }, chatbotId: string) => {
    if (!context.user) {
      throw new ORPCError("UNAUTHORIZED")
    }

    const chatbotMember = await db.query.chatbotMemberModel.findFirst({
      where: {
        chatbotId,
        userId: context.user.id,
      },
      with: {
        chatbot: true,
      },
    })

    if (!chatbotMember) {
      throw new ORPCError("UNAUTHORIZED")
    }

    return next({
      context: {
        chatbot: chatbotMember.chatbot,
      },
    })
  },
)
