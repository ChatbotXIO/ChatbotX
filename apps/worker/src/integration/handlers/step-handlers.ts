import { type Prisma, prisma } from "@aha.chat/database"
import {
  type ArchiveConversationStepSchema,
  type AssignConversationStepSchema,
  AutoAssignConversationRule,
  type AutoAssignConversationStepSchema,
  type BlockContactStepSchema,
  type DisableBotStepSchema,
  type EnableBotStepSchema,
  type FollowConversationStepSchema,
  type TypingStepSchema,
  type UnarchiveConversationStepSchema,
  type UnassignConversationStepSchema,
  type UnfollowConversationStepSchema,
} from "@aha.chat/flow-config"
import {
  broadcastToGuestParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import type { OutgoingConversation } from "@aha.chat/sdk"
import { subHours } from "date-fns"
import { getInboxWithAuthFromInboxId } from "../../lib/inbox"
import { allIntegrations } from "../../lib/integrations"
import type { ExecuteStepProps } from "./flow"

export async function stepBlockContact({
  conversation,
}: ExecuteStepProps<BlockContactStepSchema>) {
  await prisma.contact.update({
    where: { id: conversation.contactId },
    data: { blockedAt: new Date() },
  })
}

export async function stepArchiveConversation({
  conversation,
}: ExecuteStepProps<ArchiveConversationStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { archivedAt: new Date() },
  })
}

export async function stepUnarchiveConversation({
  conversation,
}: ExecuteStepProps<UnarchiveConversationStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { archivedAt: null },
  })
}

export async function stepAssignConversation({
  conversation,
  step,
}: ExecuteStepProps<AssignConversationStepSchema>) {
  if (step.assignedId.startsWith("u_")) {
    const userId = step.assignedId.substring(2)
    const chatbotMember = await prisma.chatbotMember.findFirst({
      where: {
        userId,
        chatbotId: conversation.chatbotId,
      },
    })
    if (chatbotMember) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { assignedUserId: userId },
      })
    }
  } else if (step.assignedId.startsWith("t_")) {
    const inboxTeamId = step.assignedId.substring(2)
    const inboxTeam = await prisma.inboxTeam.findFirst({
      where: {
        id: inboxTeamId,
        chatbotId: conversation.chatbotId,
      },
    })
    if (inboxTeam) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { assignedInboxTeamId: inboxTeamId },
      })
    }
  }
}

export async function stepAutoAssignConversation({
  conversation,
  step,
}: ExecuteStepProps<AutoAssignConversationStepSchema>) {
  if (step.assignedIds.length === 0) {
    return
  }

  const userIds: string[] = []
  const inboxTeamIds: string[] = []
  for (const id of step.assignedIds) {
    if (id.startsWith("u_")) {
      userIds.push(id.substring(2))
    } else if (id.startsWith("t_")) {
      inboxTeamIds.push(id.substring(2))
    }
  }

  const filterConversationConditions: Prisma.ConversationWhereInput = {}
  switch (step.rule) {
    case AutoAssignConversationRule.LAST_HOUR: {
      filterConversationConditions.createdAt = {
        gte: subHours(new Date(), 1),
      }
      break
    }
    case AutoAssignConversationRule.LAST_8HOURS: {
      filterConversationConditions.createdAt = {
        gte: subHours(new Date(), 8),
      }
      break
    }
    case AutoAssignConversationRule.LAST_24HOURS: {
      filterConversationConditions.createdAt = {
        gte: subHours(new Date(), 24),
      }
      break
    }
    default:
      break
  }

  // Init assignee map
  const allocation: Record<
    string,
    {
      assignedUserId: string | null
      assignedInboxTeamId: string | null
      count: number
    }
  > = {}

  let requiredUsers: { userId: string }[] = []
  if (userIds.length > 0) {
    requiredUsers = await prisma.chatbotMember.findMany({
      where: {
        chatbotId: conversation.chatbotId,
        id: {
          in: userIds,
        },
      },
      select: {
        userId: true,
      },
    })
    for (const u of requiredUsers) {
      allocation[`u_${u.userId}`] = {
        assignedUserId: u.userId,
        assignedInboxTeamId: null,
        count: 0,
      }
    }
  }

  let requiredInboxTeams: { id: string }[] = []
  if (inboxTeamIds.length > 0) {
    requiredInboxTeams = await prisma.inboxTeam.findMany({
      where: {
        chatbotId: conversation.chatbotId,
        id: {
          in: inboxTeamIds,
        },
      },
      select: {
        id: true,
      },
    })
    for (const t of requiredInboxTeams) {
      allocation[`t_${t.id}`] = {
        assignedUserId: null,
        assignedInboxTeamId: t.id,
        count: 0,
      }
    }
  }

  if (Object.keys(allocation).length === 0) {
    return
  }

  // Count conversations of assignee during time
  const conversationCount = await prisma.conversation.groupBy({
    by: ["assignedUserId", "assignedInboxTeamId"],
    where: {
      OR: [
        {
          assignedUserId: {
            in: requiredUsers.map((r) => r.userId),
          },
        },
        {
          assignedInboxTeamId: {
            in: requiredInboxTeams.map((r) => r.id),
          },
        },
      ],
      ...filterConversationConditions,
    },
    _count: {
      id: true,
    },
  })
  for (const cc of conversationCount) {
    if (cc.assignedUserId && allocation[`u_${cc.assignedUserId}`]) {
      allocation[`u_${cc.assignedUserId}`].count = cc._count.id
    }

    if (cc.assignedInboxTeamId && allocation[`t_${cc.assignedInboxTeamId}`]) {
      allocation[`t_${cc.assignedInboxTeamId}`].count = cc._count.id
    }
  }

  // Choose object has smallest count
  let smallestCount = Number.POSITIVE_INFINITY
  let smallestKey = ""
  for (const aa in allocation) {
    if (smallestCount > allocation[aa].count) {
      smallestKey = aa
      smallestCount = allocation[aa].count
    }
  }

  // update assignee
  await prisma.conversation.update({
    where: {
      id: conversation.id,
    },
    data: {
      assignedUserId: allocation[smallestKey].assignedUserId,
      assignedInboxTeamId: allocation[smallestKey].assignedInboxTeamId,
    },
  })
}

export async function stepUnassignConversation({
  conversation,
}: ExecuteStepProps<UnassignConversationStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      assignedUserId: null,
      assignedInboxTeamId: null,
    },
  })
}

export async function stepFollowConversation({
  conversation,
}: ExecuteStepProps<FollowConversationStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { followed: true },
  })
}

export async function stepUnfollowConversation({
  conversation,
}: ExecuteStepProps<UnfollowConversationStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { followed: false },
  })
}

export async function stepDisableBot({
  conversation,
}: ExecuteStepProps<DisableBotStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { liveChatEnabled: true },
  })
}

export async function stepEnableBot({
  conversation,
}: ExecuteStepProps<EnableBotStepSchema>) {
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { liveChatEnabled: false },
  })
}

export const stepSendTyping = async (
  props: ExecuteStepProps<TypingStepSchema>,
) => {
  const { conversation } = props

  const { inbox, auth } = await getInboxWithAuthFromInboxId(
    conversation.inboxId,
  )

  await Promise.all([
    allIntegrations[
      inbox.inboxType
    ]?.channels.channel?.conversation?.sendTyping?.({
      ctx: {
        chatbot: inbox.chatbot,
        auth,
      },
      data: {
        conversation: conversation as OutgoingConversation,
        typing: true,
      },
    }),
    broadcastToGuestParty(conversation.sourceId as string, {
      eventType: RealtimeEventType.typing,
      data: {
        conversationId: "",
        typing: true,
      },
    })
      .then(() => {
        return new Promise((resolve) => {
          setTimeout(resolve, props.step.seconds * 1000)
        })
      })
      .then(() => {
        broadcastToGuestParty(conversation.sourceId as string, {
          eventType: RealtimeEventType.typing,
          data: {
            conversationId: "",
            typing: false,
          },
        })
      }),
  ])
}
