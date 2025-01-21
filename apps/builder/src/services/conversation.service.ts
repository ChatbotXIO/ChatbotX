"use server"

import {
  AssignedType,
  type Contact,
  type Conversation,
  prisma,
} from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"

export const assignConversationService = async (
  conversations: Contact[],
  assignedId: string | null,
  assignedType: AssignedType | null,
) => {
  const ids = conversations.map((conversation) => conversation.id)
  if (!assignedType && assignedId) {
    throw new Error("Data invalid.")
  }
  let assigner = null

  if (assignedType === AssignedType.User) {
    assigner = await prisma.user.findFirst({
      where: { id: assignedId as string },
    })
    if (!assigner) {
      throw new Error("User is not exists.")
    }
  }

  if (assignedType === AssignedType.Team) {
    assigner = await prisma.team.findFirst({
      where: { id: assignedId as string },
    })
    if (!assigner) {
      if (!assigner) {
        throw new Error("Team is not exists.")
      }
    }
  }

  const data = {
    assignedId,
    assignedType,
  }

  await prisma.contact.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data,
  })
  for (const id of ids) {
    revalidateTag(`conversations#${id}`)
  }

  return { ...data, assigner }
}

export const enableLiveChatService = async (
  conversations: Conversation[],
  liveChatEnabled: boolean,
) => {
  const ids = conversations.map((conversation) => conversation.id)

  await prisma.conversation.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: { liveChatEnabled },
  })
  for (const id of ids) {
    revalidateTag(`conversations#${id}`)
  }
}

export const archiveConversationService = async (
  conversations: Conversation[],
) => {
  const data = { archivedAt: new Date() }
  const ids = conversations.map((conversation) => conversation.id)

  await prisma.conversation.updateMany({
    where: {
      id: {
        in: ids,
      },
      archivedAt: null,
    },
    data,
  })
  for (const id of ids) {
    revalidateTag(`conversations#${id}`)
  }
}

export const unarchiveConversationService = async (
  conversations: Conversation[],
) => {
  const ids = conversations.map((conversation) => conversation.id)

  await prisma.conversation.updateMany({
    where: {
      id: {
        in: ids,
      },
      archivedAt: {
        not: null,
      },
    },
    data: { archivedAt: null },
  })
  for (const id of ids) {
    revalidateTag(`conversations#${id}`)
  }
}

export const followConversationService = async (
  conversations: Conversation[],
  followed: boolean,
) => {
  const ids = conversations.map((conversation) => conversation.id)
  await prisma.conversation.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data: { followed },
  })
  for (const id of ids) {
    revalidateTag(`conversations#${id}`)
  }
}

export const blockContactService = async (conversations: Conversation[]) => {
  const data = { blockedAt: new Date() }
  const ids = conversations.map((conversation) => conversation.id)
  await prisma.conversation.updateMany({
    where: {
      id: {
        in: ids,
      },
    },
    data,
  })
  for (const id of ids) {
    revalidateTag(`conversations#${id}`)
  }
}

export const unblockContactService = async (conversations: Conversation[]) => {
  const ids = conversations.map((conversation) => conversation.id)

  await prisma.conversation.updateMany({
    where: {
      id: {
        in: ids,
      },
      blockedAt: {
        not: null,
      },
    },
    data: { blockedAt: null },
  })
  for (const id of ids) {
    revalidateTag(`conversations#${id}`)
  }
}
