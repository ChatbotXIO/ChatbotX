"use server"

import { prisma } from "@aha.chat/database"
import { BaseException } from "@/lib/errors/exception"

export async function findInvitation({ code }: { code: string }) {
  const invitation = await prisma.invitation.findUniqueOrThrow({
    where: {
      code,
    },
  })
  if (invitation.expiresAt < new Date()) {
    throw new BaseException("Invitation expired")
  }

  const user = await prisma.user.findUnique({
    where: {
      id: invitation.invitedBy,
    },
  })
  if (!user) {
    throw new BaseException("User not found")
  }

  const chatbot = invitation.chatbotId
    ? await prisma.chatbot.findUnique({
        where: {
          id: invitation.chatbotId,
        },
      })
    : null

  const organization = await prisma.organization.findUnique({
    where: {
      id: invitation.organizationId,
    },
  })
  if (!organization) {
    throw new BaseException("Organization not found")
  }

  return {
    invitation,
    user,
    chatbot,
    organization,
  }
}
