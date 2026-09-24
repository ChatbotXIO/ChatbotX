import {
  type BroadcastTarget,
  broadcastToGuestParty as broadcastToGuestPartyLow,
  broadcastToWorkspaceParty as broadcastToWorkspacePartyLow,
  type RealtimeEventData,
  revokeWorkspaceMemberConnections as revokeWorkspaceMemberConnectionsLow,
  sendToWorkspaceMember as sendToWorkspaceMemberLow,
} from "@chatbotx.io/partysocket-config"
import { resolveBroadcastSecret, resolveTenantSettings } from "./settings"

const resolveTargetByWorkspace = async (
  workspaceId: string,
): Promise<BroadcastTarget> => {
  const [{ wsUrl }, secret] = await Promise.all([
    resolveTenantSettings({ workspaceId }),
    Promise.resolve(resolveBroadcastSecret({ workspaceId })),
  ])
  return { url: wsUrl, secret }
}

export const broadcastToWorkspaceParty = async (
  workspaceId: string,
  json: RealtimeEventData,
  resolvedTarget?: BroadcastTarget,
) => {
  const target = resolvedTarget ?? (await resolveTargetByWorkspace(workspaceId))
  return broadcastToWorkspacePartyLow(target, workspaceId, json)
}

/**
 * Delivers an event to only one workspace member's currently-open realtime
 * connections (never a workspace-wide broadcast) — e.g. the VoIP offer for
 * the single agent a call was routed to.
 */
export const sendToWorkspaceMember = async (
  args: { workspaceId: string; userId: string },
  json: RealtimeEventData,
) => {
  const target = await resolveTargetByWorkspace(args.workspaceId)
  return sendToWorkspaceMemberLow(target, args.workspaceId, args.userId, json)
}

/**
 * Closes a member's tagged realtime connections in a workspace room — used
 * on membership removal so a former member's already-open socket stops
 * receiving further events immediately, rather than only on next reconnect.
 */
export const revokeWorkspaceMemberConnections = async (args: {
  workspaceId: string
  userId: string
}) => {
  const target = await resolveTargetByWorkspace(args.workspaceId)
  return revokeWorkspaceMemberConnectionsLow(
    target,
    args.workspaceId,
    args.userId,
  )
}

export const broadcastToGuestParty = async (
  args: { workspaceId: string; guestConversationId: string },
  json: RealtimeEventData,
) => {
  const target = await resolveTargetByWorkspace(args.workspaceId)
  return broadcastToGuestPartyLow(target, args.guestConversationId, json)
}
