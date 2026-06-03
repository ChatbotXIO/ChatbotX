import { conversationService } from "@chatbotx.io/business"
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
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

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
  await conversationService.updateArchived({
    workspaceId: conversation.workspaceId,
    conversations: [conversation],
    archivedAt: new Date(),
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "stepArchiveConversation",
      triggerType: "flow_action",
    },
  })
}

export async function stepUnarchiveConversation({
  conversation,
}: ExecuteStepProps<UnarchiveConversationStepSchema>) {
  await conversationService.updateArchived({
    workspaceId: conversation.workspaceId,
    conversations: [conversation],
    archivedAt: null,
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "stepUnarchiveConversation",
      triggerType: "flow_action",
    },
  })
}

export async function stepAssignConversation({
  conversation,
  step,
}: ExecuteStepProps<AssignConversationStepSchema>) {
  let assignedUserId: string | null = null
  let assignedInboxTeamId: string | null = null

  if (step.assignedId.startsWith("u_")) {
    const userId = step.assignedId.slice(2)
    const workspaceMember = await db.query.workspaceMemberModel.findFirst({
      where: {
        userId,
        workspaceId: conversation.workspaceId,
      },
    })
    if (workspaceMember) {
      assignedUserId = userId
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
      assignedInboxTeamId = inboxTeamId
    }
  }

  if (!(assignedUserId || assignedInboxTeamId)) {
    return
  }

  await conversationService.updateAssignment({
    workspaceId: conversation.workspaceId,
    conversations: [conversation],
    assignedUserId,
    assignedInboxTeamId,
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "stepAssignConversation",
      triggerType: "flow_action",
    },
  })
}

export async function stepAutoAssignConversation({
  conversation,
  step,
}: ExecuteStepProps<AutoAssignConversationStepSchema>): Promise<ExecuteStepResult> {
  if (step.assignedIds.length === 0) {
    return {
      status: "error",
      errorMessage: "No assignees configured",
      result: undefined,
    }
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
    return {
      status: "error",
      errorMessage: "No eligible agents found for allocation",
      result: undefined,
    }
  }

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

  let smallestCount = Number.POSITIVE_INFINITY
  let smallestKey = ""
  for (const aa in allocation) {
    if (smallestCount > allocation[aa].count) {
      smallestKey = aa
      smallestCount = allocation[aa].count
    }
  }

  await conversationService.updateAssignment({
    workspaceId: conversation.workspaceId,
    conversations: [conversation],
    assignedUserId: allocation[smallestKey].assignedUserId,
    assignedInboxTeamId: allocation[smallestKey].assignedInboxTeamId,
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "stepAutoAssignConversation",
      triggerType: "flow_action",
    },
  })

  return { status: "success", result: undefined }
}

export async function stepUnassignConversation({
  conversation,
}: ExecuteStepProps<UnassignConversationStepSchema>) {
  await conversationService.updateAssignment({
    workspaceId: conversation.workspaceId,
    conversations: [conversation],
    assignedUserId: null,
    assignedInboxTeamId: null,
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "stepUnassignConversation",
      triggerType: "flow_action",
    },
  })
}

export async function stepFollowConversation({
  conversation,
}: ExecuteStepProps<FollowConversationStepSchema>) {
  await conversationService.updateFollowed({
    workspaceId: conversation.workspaceId,
    id: conversation.id,
    contactId: conversation.contactId,
    followed: true,
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "stepFollowConversation",
      triggerType: "flow_action",
    },
  })
}

export async function stepUnfollowConversation({
  conversation,
}: ExecuteStepProps<UnfollowConversationStepSchema>) {
  await conversationService.updateFollowed({
    workspaceId: conversation.workspaceId,
    id: conversation.id,
    contactId: conversation.contactId,
    followed: false,
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "stepUnfollowConversation",
      triggerType: "flow_action",
    },
  })
}

export async function stepDisableBot({
  conversation,
}: ExecuteStepProps<DisableBotStepSchema>) {
  await conversationService.disableBotState({
    workspaceId: conversation.workspaceId,
    conversations: [conversation],
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "stepDisableBot",
      triggerType: "flow_action",
    },
  })
}

export async function stepEnableBot({
  conversation,
}: ExecuteStepProps<EnableBotStepSchema>) {
  await conversationService.enableBotState({
    workspaceId: conversation.workspaceId,
    conversations: [conversation],
    triggerContext: {
      triggerSource: "worker",
      triggerHandler: "stepEnableBot",
      triggerType: "flow_action",
    },
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
