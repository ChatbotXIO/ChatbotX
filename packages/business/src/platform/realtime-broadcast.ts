import {
  type BroadcastTarget,
  broadcastToGuestParty as broadcastToGuestPartyLow,
  broadcastToUserParty as broadcastToUserPartyLow,
  broadcastToWorkspaceParty as broadcastToWorkspacePartyLow,
  type RealtimeEventData,
  type RealtimeEventNotifyExportResult,
} from "@chatbotx.io/partysocket-config"
import { resolveBroadcastSecret, resolvePlatformSettings } from "./settings"

const resolveTargetByWorkspace = async (
  workspaceId: string,
): Promise<BroadcastTarget> => {
  const [{ realtimeUrl }, secret] = await Promise.all([
    resolvePlatformSettings({ workspaceId }),
    Promise.resolve(resolveBroadcastSecret({ workspaceId })),
  ])
  return { url: realtimeUrl, secret }
}

const resolveTargetByOrganization = async (
  organizationId: string,
): Promise<BroadcastTarget> => {
  const [{ realtimeUrl }, secret] = await Promise.all([
    resolvePlatformSettings({ organizationId }),
    Promise.resolve(resolveBroadcastSecret({ organizationId })),
  ])
  return { url: realtimeUrl, secret }
}

export const broadcastToWorkspaceParty = async (
  workspaceId: string,
  json: RealtimeEventData,
) => {
  const target = await resolveTargetByWorkspace(workspaceId)
  return broadcastToWorkspacePartyLow(target, workspaceId, json)
}

export const broadcastToGuestParty = async (
  args: { workspaceId: string; guestConversationId: string },
  json: RealtimeEventData,
) => {
  const target = await resolveTargetByWorkspace(args.workspaceId)
  return broadcastToGuestPartyLow(target, args.guestConversationId, json)
}

export const broadcastToUserParty = async (
  args: { organizationId: string; userId: string },
  json: RealtimeEventNotifyExportResult,
) => {
  const target = await resolveTargetByOrganization(args.organizationId)
  return broadcastToUserPartyLow(target, args.userId, json)
}
