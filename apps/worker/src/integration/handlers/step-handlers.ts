import {
  and,
  db,
  eq,
  gte,
  inArray,
  or,
  type SQL,
  sql,
} from "@aha.chat/database/client"
import { contactModel, conversationModel } from "@aha.chat/database/schema"
import {
  emitConversationArchived,
  emitConversationAssigned,
  emitConversationTransferredToBot,
  emitConversationTransferredToHuman,
  emitConversationUnassigned,
} from "@aha.chat/events"
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
  await db
    .update(contactModel)
    .set({
      blockedAt: new Date(),
    })
    .where(eq(contactModel.id, conversation.contactId))
}

export async function stepArchiveConversation({
  conversation,
}: ExecuteStepProps<ArchiveConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({
      archivedAt: new Date(),
    })
    .where(eq(conversationModel.id, conversation.id))

  // Emit conversation archived event
  try {
    await emitConversationArchived(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
    )
  } catch (error) {
    console.error("Failed to emit conversationArchived event:", error)
  }
}

export async function stepUnarchiveConversation({
  conversation,
}: ExecuteStepProps<UnarchiveConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({
      archivedAt: null,
    })
    .where(eq(conversationModel.id, conversation.id))
}

export async function stepAssignConversation({
  conversation,
  step,
}: ExecuteStepProps<AssignConversationStepSchema>) {
  let assignedTo: string | null = null

  if (step.assignedId.startsWith("u_")) {
    const userId = step.assignedId.substring(2)
    const chatbotMember = await db.query.chatbotMemberModel.findFirst({
      where: {
        userId,
        chatbotId: conversation.chatbotId,
      },
    })
    if (chatbotMember) {
      await db
        .update(conversationModel)
        .set({
          assignedUserId: userId,
        })
        .where(eq(conversationModel.id, conversation.id))
      assignedTo = userId
    }
  } else if (step.assignedId.startsWith("t_")) {
    const inboxTeamId = step.assignedId.substring(2)
    const inboxTeam = await db.query.inboxTeamModel.findFirst({
      where: {
        id: inboxTeamId,
        chatbotId: conversation.chatbotId,
      },
    })
    if (inboxTeam) {
      await db
        .update(conversationModel)
        .set({
          assignedInboxTeamId: inboxTeamId,
        })
        .where(eq(conversationModel.id, conversation.id))
      assignedTo = inboxTeamId
    }
  }

  // Emit conversation assigned event
  if (assignedTo) {
    try {
      await emitConversationAssigned(
        conversation.chatbotId,
        conversation.contactId,
        conversation.id,
        assignedTo,
      )
    } catch (error) {
      console.error("Failed to emit conversationAssigned event:", error)
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

  const filterConversationConditions: SQL[] = []
  switch (step.rule) {
    case AutoAssignConversationRule.LAST_HOUR: {
      filterConversationConditions.push(
        gte(conversationModel.createdAt, subHours(new Date(), 1)),
      )
      break
    }
    case AutoAssignConversationRule.LAST_8HOURS: {
      filterConversationConditions.push(
        gte(conversationModel.createdAt, subHours(new Date(), 8)),
      )
      break
    }
    case AutoAssignConversationRule.LAST_24HOURS: {
      filterConversationConditions.push(
        gte(conversationModel.createdAt, subHours(new Date(), 24)),
      )
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
    requiredUsers = await db.query.chatbotMemberModel.findMany({
      where: {
        chatbotId: conversation.chatbotId,
        id: {
          in: userIds,
        },
      },
      columns: {
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
    requiredInboxTeams = await db.query.inboxTeamModel.findMany({
      where: {
        chatbotId: conversation.chatbotId,
        id: {
          in: inboxTeamIds,
        },
      },
      columns: {
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
  const conversationCount = await db
    .select({
      assignedUserId: conversationModel.assignedUserId,
      assignedInboxTeamId: conversationModel.assignedInboxTeamId,
      conversationsCount: sql<number>`cast(count(${conversationModel.id}) as int)`,
    })
    .from(conversationModel)
    .groupBy(
      conversationModel.assignedUserId,
      conversationModel.assignedInboxTeamId,
    )
    .where(
      and(
        ...filterConversationConditions,
        and(
          or(
            inArray(
              conversationModel.assignedUserId,
              requiredUsers.map((r) => r.userId),
            ),
            inArray(
              conversationModel.assignedInboxTeamId,
              requiredInboxTeams.map((r) => r.id),
            ),
          ),
        ),
      ),
    )
  for (const cc of conversationCount) {
    if (cc.assignedUserId && allocation[`u_${cc.assignedUserId}`]) {
      allocation[`u_${cc.assignedUserId}`].count = cc.conversationsCount
    }

    if (cc.assignedInboxTeamId && allocation[`t_${cc.assignedInboxTeamId}`]) {
      allocation[`t_${cc.assignedInboxTeamId}`].count = cc.conversationsCount
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
  await db
    .update(conversationModel)
    .set({
      assignedUserId: allocation[smallestKey].assignedUserId,
      assignedInboxTeamId: allocation[smallestKey].assignedInboxTeamId,
    })
    .where(eq(conversationModel.id, conversation.id))
}

export async function stepUnassignConversation({
  conversation,
}: ExecuteStepProps<UnassignConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({
      assignedUserId: null,
      assignedInboxTeamId: null,
    })
    .where(eq(conversationModel.id, conversation.id))

  // Emit conversation unassigned event
  try {
    await emitConversationUnassigned(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
    )
  } catch (error) {
    console.error("Failed to emit conversationUnassigned event:", error)
  }
}

export async function stepFollowConversation({
  conversation,
}: ExecuteStepProps<FollowConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({
      followed: true,
    })
    .where(eq(conversationModel.id, conversation.id))
}

export async function stepUnfollowConversation({
  conversation,
}: ExecuteStepProps<UnfollowConversationStepSchema>) {
  await db
    .update(conversationModel)
    .set({
      followed: false,
    })
    .where(eq(conversationModel.id, conversation.id))
}

export async function stepDisableBot({
  conversation,
}: ExecuteStepProps<DisableBotStepSchema>) {
  await db
    .update(conversationModel)
    .set({
      liveChatEnabled: true,
    })
    .where(eq(conversationModel.id, conversation.id))

  // Emit conversation transferred to human event
  try {
    await emitConversationTransferredToHuman(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
    )
  } catch (error) {
    console.error("Failed to emit conversationTransferredToHuman event:", error)
  }
}

export async function stepEnableBot({
  conversation,
}: ExecuteStepProps<EnableBotStepSchema>) {
  await db
    .update(conversationModel)
    .set({
      liveChatEnabled: false,
    })
    .where(eq(conversationModel.id, conversation.id))

  // Emit conversation transferred to bot event
  try {
    await emitConversationTransferredToBot(
      conversation.chatbotId,
      conversation.contactId,
      conversation.id,
    )
  } catch (error) {
    console.error("Failed to emit conversationTransferredToBot event:", error)
  }
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
