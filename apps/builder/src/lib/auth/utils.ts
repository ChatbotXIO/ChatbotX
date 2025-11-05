"use server"

import { headers } from "next/headers"
import { findChatbotOrFail } from "../user-permissions"
import { auth } from "./auth"

export const getCurrentUserId = async (): Promise<string> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  return session?.user.id || "unknown"
}

export const assertCurrentUserCanAccessChatbot = async (chatbotId: string) => {
  const userId = await getCurrentUserId()

  return await findChatbotOrFail(userId, chatbotId)
}
