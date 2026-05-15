import {
  and,
  db,
  eq,
  gte,
  inArray,
  or,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import { contactModel, conversationModel } from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import {
  emitConversationArchived,
  emitConversationAssigned,
  emitConversationTransferredToBot,
  emitConversationTransferredToHuman,
  emitConversationUnassigned,
} from "@chatbotx.io/events"
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
} from "@chatbotx.io/flow-config"
import { subHours } from "date-fns"
import {
  allIntegrations,
  resolveIntegrationContextFromContactInbox,
} from "../../services/integrations"
import {
  disableConversationState,
  enableConversationState,
} from "./conversation"
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
      conversation.workspaceId,
      conversation.contactId,
      conversation.id,
    )
  } catch (error) {
    console.error("Failed to emit conversationArchived event:", error)
  }

  emit("analytics:dashboard", {
    eventType: "conversation:archived",
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    occurredAt: new Date(),
    metadata: {
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "stepArchiveConversation",
        triggerType: "flow_action",
      },
    },
  }).catch((error) => {
    console.error("[stepArchiveConversation] Failed to emit", error)
  })
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

  emit("analytics:dashboard", {
    eventType: "conversation:unarchived",
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    occurredAt: new Date(),
    metadata: {
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "stepUnarchiveConversation",
        triggerType: "flow_action",
      },
    },
  }).catch((error) => {
    console.error("[stepUnarchiveConversation] Failed to emit", error)
  })
}

export async function stepAssignConversation({
  conversation,
  step,
}: ExecuteStepProps<AssignConversationStepSchema>) {
  let assignedTo: string | null = null

  if (step.assignedId.startsWith("u_")) {
    const userId = step.assignedId.slice(2)
    const workspaceMember = await db.query.workspaceMemberModel.findFirst({
      where: {
        userId,
        workspaceId: conversation.workspaceId,
      },
    })
    if (workspaceMember) {
      await db
        .update(conversationModel)
        .set({
          assignedUserId: userId,
        })
        .where(eq(conversationModel.id, conversation.id))
      assignedTo = userId
    }
  } else if (step.assignedId.startsWith("t_")) {
    const inboxTeamId = step.assignedId.slice(2)
    const inboxTeam = await db.query.inboxTeamModel.findFirst({
      where: {
        id: inboxTeamId,
        workspaceId: conversation.workspaceId,
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
        conversation.workspaceId,
        conversation.contactId,
        conversation.id,
        assignedTo,
      )
    } catch (error) {
      console.error("Failed to emit conversationAssigned event:", error)
    }

    emit("analytics:dashboard", {
      eventType: "conversation:assigned",
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      occurredAt: new Date(),
      toAssignee: assignedTo,
      metadata: {
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "stepAssignConversation",
          triggerType: "flow_action",
        },
      },
    }).catch((error) => {
      console.error("[stepAssignConversation] Failed to emit", error)
    })
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
      userIds.push(id.slice(2))
    } else if (id.startsWith("t_")) {
      inboxTeamIds.push(id.slice(2))
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
    requiredUsers = await db.query.workspaceMemberModel.findMany({
      where: {
        workspaceId: conversation.workspaceId,
        userId: {
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
        workspaceId: conversation.workspaceId,
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

  // Emit conversation assigned event
  const assignedTo =
    allocation[smallestKey].assignedUserId ||
    allocation[smallestKey].assignedInboxTeamId
  if (assignedTo) {
    try {
      await emitConversationAssigned(
        conversation.workspaceId,
        conversation.contactId,
        conversation.id,
        assignedTo,
      )
    } catch (error) {
      console.error("Failed to emit conversationAssigned event:", error)
    }

    emit("analytics:dashboard", {
      eventType: "conversation:assigned",
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      occurredAt: new Date(),
      toAssignee: assignedTo,
      metadata: {
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "stepAutoAssignConversation",
          triggerType: "flow_action",
        },
      },
    }).catch((error) => {
      console.error("[stepAutoAssignConversation] Failed to emit", error)
    })
  }
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
      conversation.workspaceId,
      conversation.contactId,
      conversation.id,
    )
  } catch (error) {
    console.error("Failed to emit conversationUnassigned event:", error)
  }

  emit("analytics:dashboard", {
    eventType: "conversation:unassigned",
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    fromAssignee:
      conversation.assignedUserId || conversation.assignedInboxTeamId || "",
    occurredAt: new Date(),
    metadata: {
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "stepUnassignConversation",
        triggerType: "flow_action",
      },
    },
  }).catch((error) => {
    console.error("[stepUnassignConversation] Failed to emit", error)
  })
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

  emit("analytics:dashboard", {
    eventType: "conversation:followed",
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    occurredAt: new Date(),
    metadata: {
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "stepFollowConversation",
        triggerType: "flow_action",
      },
    },
  }).catch((error) => {
    console.error("[stepFollowConversation] Failed to emit", error)
  })
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

  emit("analytics:dashboard", {
    eventType: "conversation:unfollowed",
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    occurredAt: new Date(),
    metadata: {
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "stepUnfollowConversation",
        triggerType: "flow_action",
      },
    },
  }).catch((error) => {
    console.error("[stepUnfollowConversation] Failed to emit", error)
  })
}

export async function stepDisableBot({
  conversation,
}: ExecuteStepProps<DisableBotStepSchema>) {
  await disableConversationState({
    workspaceId: conversation.workspaceId,
    conversationIds: [conversation.id],
  })

  // Emit conversation transferred to human event
  try {
    await emitConversationTransferredToHuman(
      conversation.workspaceId,
      conversation.contactId,
      conversation.id,
    )
  } catch (error) {
    console.error("Failed to emit conversationTransferredToHuman event:", error)
  }

  emit("analytics:dashboard", {
    eventType: "conversation:transferred_to_human",
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    occurredAt: new Date(),
    metadata: {
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "stepDisableBot",
        triggerType: "flow_action",
      },
    },
  }).catch((error) => {
    console.error("[stepDisableBot] Failed to emit", error)
  })
}

export async function stepEnableBot({
  conversation,
}: ExecuteStepProps<EnableBotStepSchema>) {
  await enableConversationState({
    workspaceId: conversation.workspaceId,
    conversationIds: [conversation.id],
  })

  // Emit conversation transferred to bot event
  try {
    await emitConversationTransferredToBot(
      conversation.workspaceId,
      conversation.contactId,
      conversation.id,
    )
  } catch (error) {
    console.error("Failed to emit conversationTransferredToBot event:", error)
  }

  emit("analytics:dashboard", {
    eventType: "conversation:transferred_to_bot",
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    occurredAt: new Date(),
    metadata: {
      triggerContext: {
        triggerSource: "worker",
        triggerHandler: "stepEnableBot",
        triggerType: "flow_action",
      },
    },
  }).catch((error) => {
    console.error("[stepEnableBot] Failed to emit", error)
  })
}

export const stepSendTyping = async (
  props: ExecuteStepProps<TypingStepSchema>,
) => {
  const { conversation, contactInbox: baseContactInbox } = props

  const contactInbox =
    baseContactInbox ||
    (await db.query.contactInboxModel.findFirst({
      where: {
        contactId: conversation.contactId,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    }))

  if (!contactInbox) {
    return
  }

  if (!allIntegrations[contactInbox.channel]) {
    return
  }

  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  await integration.runChannelHandler("conversation", "sendTyping", {
    ctx,
    data: {
      contact: contactInbox,
      typing: true,
      seconds: props.step.seconds,
    },
  })
}
