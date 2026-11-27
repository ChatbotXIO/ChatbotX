"use client"

import {
  resolveThreadTakePermission,
  type ThreadTakePermission,
  threadTakePermissions,
} from "@chatbotx.io/database/partials"
import type { ThreadControlChannel } from "@chatbotx.io/utils/channel"
import { useQuery } from "@tanstack/react-query"
import { THREAD_CONTROL_CHANNEL_UI } from "@/features/messages/lib/thread-control-channel-ui"
import { orpc } from "@/lib/orpc/query"

/**
 * Whether this app may take over the locked thread, from the roles the
 * channel reported for the thread's number (WhatsApp `routing_roles`: only
 * the escalation partner can take, Meta error 2494191 otherwise). Channels
 * without such roles, and roles never checked, answer `unknown`: the take is
 * offered and the channel decides.
 */
export function useThreadTakePermission(input: {
  channel: ThreadControlChannel
  workspaceId: string
  inboxId: string
  enabled: boolean
}): ThreadTakePermission {
  const readsRoutingRoles =
    THREAD_CONTROL_CHANNEL_UI[input.channel].takePermissionFromRoutingRoles
  const { data: snapshot } = useQuery(
    orpc.integrationWhatsappAPIs.getWhatsappRoutingRolesByInboxAPI.queryOptions(
      {
        input: { workspaceId: input.workspaceId, inboxId: input.inboxId },
        enabled: readsRoutingRoles && input.enabled,
      },
    ),
  )
  if (!readsRoutingRoles) {
    return threadTakePermissions.enum.unknown
  }
  return resolveThreadTakePermission(snapshot ?? null)
}
