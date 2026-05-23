import {
  type BroadcastTarget,
  broadcastToGuestParty as broadcastToGuestPartyLow,
  broadcastToWorkspaceParty as broadcastToWorkspacePartyLow,
  type RealtimeEventData,
} from "@chatbotx.io/partysocket-config"
import { resolveBroadcastSecret, resolvePlatformSettings } from "./settings"

const resolveTargetByWorkspace = async (
  workspaceId: string,
): Promise<BroadcastTarget> => {
  const [{ wsUrl }, secret] = await Promise.all([
    resolvePlatformSettings({ workspaceId }),
    Promise.resolve(resolveBroadcastSecret({ workspaceId })),
  ])
  return { url: wsUrl, secret }
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
