import type {
  RealtimeChatScope,
  RealtimeEventData,
  RealtimeEventRoute,
} from "@chatbotx.io/realtime-protocol"

export {
  getRealtimeStreamKey,
  getRealtimeStreamShard,
  REALTIME_STREAM_SHARD_COUNT,
} from "@chatbotx.io/realtime-protocol"

const workspaceTopic = (workspaceId: string, suffix: string): string =>
  `ws:${workspaceId}:${suffix}`

export const getWorkspaceAllTopic = (workspaceId: string): string =>
  workspaceTopic(workspaceId, "all")

export const getWorkspaceInboxTopic = (
  workspaceId: string,
  inboxId: string,
): string => workspaceTopic(workspaceId, `inbox:${inboxId}`)

export const getWorkspaceTeamTopic = (
  workspaceId: string,
  teamId: string,
): string => workspaceTopic(workspaceId, `team:${teamId}`)

export const getWorkspaceUserTopic = (
  workspaceId: string,
  userId: string,
): string => workspaceTopic(workspaceId, `user:${userId}`)

export const getWorkspaceConnectionTopics = ({
  chatScope,
  teamIds,
  userId,
  workspaceId,
}: {
  chatScope: RealtimeChatScope
  teamIds: string[]
  userId: string
  workspaceId: string
}): string[] => {
  if (chatScope === "none") {
    return []
  }
  if (chatScope === "all") {
    return [getWorkspaceAllTopic(workspaceId)]
  }
  return [
    getWorkspaceUserTopic(workspaceId, userId),
    ...teamIds.map((teamId) => getWorkspaceTeamTopic(workspaceId, teamId)),
  ]
}

const getRouteTopics = (
  workspaceId: string,
  route: RealtimeEventRoute,
): string[] => [
  ...(route.inboxId
    ? [getWorkspaceInboxTopic(workspaceId, route.inboxId)]
    : []),
  ...route.assignedTeamIds.map((teamId) =>
    getWorkspaceTeamTopic(workspaceId, teamId),
  ),
  ...route.assignedUserIds.map((userId) =>
    getWorkspaceUserTopic(workspaceId, userId),
  ),
]

/**
 * Full-access connections always receive chat events through `all`; assigned
 * connections receive only the route-specific topics. An unrouted event is
 * deliberately all-only, preserving the Phase 2 safe fallback for restricted
 * members while old producers are removed.
 */
export const getWorkspaceEventTopics = (
  workspaceId: string,
  event: Pick<RealtimeEventData, "route">,
): string[] => [
  getWorkspaceAllTopic(workspaceId),
  ...(event.route ? getRouteTopics(workspaceId, event.route) : []),
]
