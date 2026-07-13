import { parseBigIntId } from "@chatbotx.io/utils"

export const UNASSIGNED_ASSIGNEE_VALUE = "unassigned"
const USER_ASSIGNEE_PREFIX = "u_"
const TEAM_ASSIGNEE_PREFIX = "t_"

export type ConversationAssigneeSelection = {
  hasUnassigned: boolean
  userIds: string[]
  inboxTeamIds: string[]
}

export const parseConversationAssigneeValues = (
  values: string[],
): ConversationAssigneeSelection => {
  const selection: ConversationAssigneeSelection = {
    hasUnassigned: false,
    userIds: [],
    inboxTeamIds: [],
  }

  for (const value of values) {
    if (value === UNASSIGNED_ASSIGNEE_VALUE) {
      selection.hasUnassigned = true
      continue
    }

    if (value.startsWith(USER_ASSIGNEE_PREFIX)) {
      const userId = parseBigIntId(value.slice(USER_ASSIGNEE_PREFIX.length))
      if (userId) {
        selection.userIds.push(userId)
      }
      continue
    }

    if (value.startsWith(TEAM_ASSIGNEE_PREFIX)) {
      const inboxTeamId = parseBigIntId(
        value.slice(TEAM_ASSIGNEE_PREFIX.length),
      )
      if (inboxTeamId) {
        selection.inboxTeamIds.push(inboxTeamId)
      }
    }
  }

  return selection
}
