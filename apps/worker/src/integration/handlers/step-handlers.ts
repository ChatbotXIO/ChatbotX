import {
  contactInboxService,
  contactService,
  conversationService,
  inboxTeamService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { gte, type SQL } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
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
  // `block` → `update` adds `findByIdOrFail` + `emitContactInfoChangeEvents` +
  // cache invalidation the raw write lacked — a deliberate behavior change;
  // called out in the PR body.
  await contactService.block({
    workspaceId: conversation.workspaceId,
    id: conversation.contactId,
  })
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
    const isMember = await workspaceMemberService.isMember({
      workspaceId: conversation.workspaceId,
      userId,
    })
    if (isMember) {
      assignedUserId = userId
    }
  } else if (step.assignedId.startsWith("t_")) {
    const inboxTeamId = step.assignedId.slice(2)
    const teamExists = await inboxTeamService.exists({
      workspaceId: conversation.workspaceId,
      id: inboxTeamId,
    })
    if (teamExists) {
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
    requiredUsers = await workspaceMemberService.listExistingUserIds({
      workspaceId: conversation.workspaceId,
      userIds,
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
    requiredInboxTeams = await inboxTeamService.listExistingIds({
      workspaceId: conversation.workspaceId,
      ids: inboxTeamIds,
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

  const conversationCount = await conversationService.countByAssignee({
    filterConditions: filterConversationConditions,
    userIds: requiredUsers.map((r) => r.userId),
    inboxTeamIds: requiredInboxTeams.map((r) => r.id),
  })
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
    (await contactInboxService.findRecentByContactId({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
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
