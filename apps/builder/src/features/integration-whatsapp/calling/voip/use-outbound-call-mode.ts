"use client"

import { useQuery } from "@tanstack/react-query"
import type { ResolveOutboundCallModeResult } from "../actions/resolve-outbound-call-mode.action"
import { resolveOutboundCallModeAction } from "../actions/resolve-outbound-call-mode.action"
import { outboundCallModeQueryKey } from "./outbound-call-mode-query-key"

/**
 * Resolves which call control (browser-WebRTC VoIP, or none) the thread
 * header should render for a conversation — see
 * `resolveOutboundCallModeAction`. TanStack Query wraps the server action
 * (not an oRPC procedure) directly: cached per `workspaceId`/`conversationId`,
 * refetched on remount, and never blocking `MessageHead`'s own render —
 * callers render the header immediately and let this resolve in the
 * background.
 */
export function useOutboundCallMode(
  workspaceId: string | undefined,
  conversationId: string | undefined,
) {
  return useQuery<ResolveOutboundCallModeResult>({
    queryKey: outboundCallModeQueryKey(workspaceId, conversationId),
    queryFn: async () => {
      if (!(workspaceId && conversationId)) {
        throw new Error("missing workspaceId/conversationId")
      }
      const result = await resolveOutboundCallModeAction(workspaceId, {
        conversationId,
      })
      if (!result?.data) {
        throw new Error(
          result?.serverError ?? "resolve-outbound-call-mode-failed",
        )
      }
      return result.data
    },
    enabled: Boolean(workspaceId && conversationId),
    staleTime: 30_000,
  })
}
