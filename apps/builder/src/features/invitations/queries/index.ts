"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  invitationModel,
  organizationModel,
  userModel,
} from "@chatbotx.io/database/schema"
import type { ChatbotModel } from "@chatbotx.io/database/types"
import { ChatbotXException } from "@/lib/errors/exception"

export async function findInvitation({ code }: { code: string }) {
  const invitation = await findOrFail(
    invitationModel,
    {
      code,
    },
    "Invitation not found",
  )
  if (invitation.expiresAt < new Date()) {
    throw new ChatbotXException("Invitation expired")
  }

  const user = await findOrFail(
    userModel,
    {
      id: invitation.invitedBy,
    },
    "User not found",
  )

  let chatbot: ChatbotModel | null = null
  if (invitation.chatbotId) {
    chatbot =
      (await db.query.chatbotModel.findFirst({
        where: {
          id: invitation.chatbotId,
        },
      })) ?? null
  }

  const organization = await findOrFail(
    organizationModel,
    {
      id: invitation.organizationId,
    },
    "Organization not found",
  )

  return {
    invitation,
    user,
    chatbot,
    organization,
  }
}
