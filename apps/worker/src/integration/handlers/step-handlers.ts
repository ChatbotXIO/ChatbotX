import {
  contactInboxService,
  contactService,
  conversationService,
  inboxTeamService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { gte, type SQL } from "@chatbotx.io/database/client"
import { channelTypes } from "@chatbotx.io/database/partials"
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
  type MarkConversationAsReadStepSchema,
  type MarkConversationAsUnreadStepSchema,
  type TypingStepSchema,
  type UnarchiveConversationStepSchema,
  type UnassignConversationStepSchema,
  type UnfollowConversationStepSchema,
} from "@chatbotx.io/flow-config"
import { subHours } from "date-fns"
import {
  resolveWhatsappMessageSourceId,
  sendTypingToChannel,
} from "../../chat/handlers/send-message"
import { logger } from "../../lib/logger"
import { resolveIntegrationContextFromContactInbox } from "../../services/integrations"
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
  await conversationService.assignOneOrSkip({
    workspaceId: conversation.workspaceId,
    conversation,
    assignedId: step.assignedId,
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

export async function stepMarkConversationAsUnread({
  conversation,
}: ExecuteStepProps<MarkConversationAsUnreadStepSchema>) {
  await conversationService.markUnread({
    workspaceId: conversation.workspaceId,
    id: conversation.id,
  })
}

// Channels whose "Seen" receipt the Mark Read step sends. Explicit on purpose:
// the `api` channel also implements `agentMarkAsRead` but is out of scope, so
// "has a handler" is not the right test.
const READ_RECEIPT_CHANNELS: ReadonlySet<string> = new Set([
  channelTypes.enum.messenger,
  channelTypes.enum.instagram,
  channelTypes.enum.whatsapp,
])

// Shared by the Mark Read receipt and the Typing step: a step's props carry
// the flow's current contactInbox, but not every trigger sets one (e.g. an
// automation firing outside a message context), so fall back to the
// contact's most recently active one.
async function resolveContactInbox(
  contactInbox: Awaited<
    ReturnType<typeof contactInboxService.findRecentByContactId>
  >,
  workspaceId: string,
  contactId: string,
) {
  return (
    contactInbox ||
    (await contactInboxService.findRecentByContactId({
      workspaceId,
      contactId,
    }))
  )
}

export async function stepMarkConversationAsRead(
  props: ExecuteStepProps<MarkConversationAsReadStepSchema>,
) {
  const { conversation } = props

  await conversationService.updateReadStatus({
    workspaceId: conversation.workspaceId,
    id: conversation.id,
    agentLastReadAt: new Date(),
  })

  // Comment threads (`sourceId` = post id) are not a DM the contact opened.
  if (conversation.sourceId !== null) {
    return
  }

  await sendReadReceipt(props)
}

/** Best-effort channel "Seen" receipt: never throws, the flow continues. */
async function sendReadReceipt(
  props: ExecuteStepProps<MarkConversationAsReadStepSchema>,
) {
  const { conversation } = props
  let channel: string | undefined

  try {
    const contactInbox = await resolveContactInbox(
      props.contactInbox,
      conversation.workspaceId,
      conversation.contactId,
    )
    if (!contactInbox) {
      return
    }
    channel = contactInbox.channel
    if (!READ_RECEIPT_CHANNELS.has(contactInbox.channel)) {
      return
    }

    const isWhatsapp = contactInbox.channel === channelTypes.enum.whatsapp
    const messageSourceId = await resolveWhatsappMessageSourceId({
      conversation,
      contactInbox,
    })
    if (isWhatsapp && !messageSourceId) {
      logger.debug(
        {
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
        },
        "stepMarkConversationAsRead: no incoming WhatsApp message to mark read",
      )
      return
    }

    const { integration, ctx } =
      await resolveIntegrationContextFromContactInbox({
        workspaceId: conversation.workspaceId,
        contactInbox,
      })

    await integration.runChannelHandler("conversation", "agentMarkAsRead", {
      ctx,
      data: { contact: contactInbox, messageSourceId },
    })
  } catch (err) {
    logger.warn(
      {
        err,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        channel,
      },
      "stepMarkConversationAsRead: channel receipt failed",
    )
  }
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

  const contactInbox = await resolveContactInbox(
    baseContactInbox,
    conversation.workspaceId,
    conversation.contactId,
  )

  if (!contactInbox) {
    return
  }

  // Shared path so the WhatsApp wamid lookup lives in one place.
  await sendTypingToChannel({
    conversation,
    contactInbox,
    typing: true,
    seconds: props.step.seconds,
  })
}
