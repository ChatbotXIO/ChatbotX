"use server"

import { db } from "@aha.chat/database/client"
import type {
  ChatbotMemberModel,
  ChatbotModel,
  UserModel,
} from "@aha.chat/database/types"
import { headers } from "next/headers"
import { ChatbotXException } from "../errors/exception"
import { auth } from "./auth"

export const getCurrentUserId = async (): Promise<string> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session?.user.id || "unknown"
}

export const getCurrentUser = async (): Promise<UserModel | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session?.user
    ? {
        ...session.user,
        image: session.user.image || null,
        isAnonymous: session.user.isAnonymous ?? false,
        // stripeCustomerId: session.user.stripeCustomerId || null,
      }
    : null
}

export const assertCurrentUserCanAccessChatbot = async (chatbotId: string) => {
  const userAndChatbots = await getCurrentUserAndTargetChatbot(chatbotId)

  if (!userAndChatbots) {
    throw new ChatbotXException("User is not associated with this chatbot")
  }
}

export const getCurrentUserAndAllLinkedChatbots = async (): Promise<{
  user: UserModel
  allChatbots: ChatbotModel[]
  allChatbotMembers: (ChatbotMemberModel & { chatbot: ChatbotModel })[]
} | null> => {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  const chatbotMembers = await db.query.chatbotMemberModel.findMany({
    where: {
      userId: user.id,
    },
    with: {
      chatbot: true,
    },
  })

  return {
    user,
    allChatbots: chatbotMembers.map((chatbotMember) => chatbotMember.chatbot),
    allChatbotMembers: chatbotMembers,
  }
}

export const getCurrentUserAndTargetChatbot = async (
  chatbotId: string,
): Promise<{
  user: UserModel
  targetChatbot: ChatbotModel
  targetChatbotMember: ChatbotMemberModel
  allChatbots: ChatbotModel[]
  allChatbotMembers: (ChatbotMemberModel & { chatbot: ChatbotModel })[]
} | null> => {
  const userAndChatbots = await getCurrentUserAndAllLinkedChatbots()
  if (!userAndChatbots) {
    return null
  }

  const targetChatbotMember = userAndChatbots.allChatbotMembers.find(
    (chatbotMember) => chatbotMember.chatbotId === chatbotId,
  )
  if (!targetChatbotMember) {
    return null
  }

  return {
    ...userAndChatbots,
    targetChatbot: targetChatbotMember.chatbot,
    targetChatbotMember,
  }
}
