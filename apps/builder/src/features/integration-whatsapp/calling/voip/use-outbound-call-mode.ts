"use client"

import { useQuery } from "@tanstack/react-query"
import type { ResolveOutboundCallModeResult } from "../actions/resolve-outbound-call-mode.action"
import { resolveOutboundCallModeAction } from "../actions/resolve-outbound-call-mode.action"
import { outboundCallModeQueryKeys } from "./outbound-call-mode-query-key"

/**
 * Resolves which call control (browser-WebRTC VoIP, or none) should render for a
 * conversation — see `resolveOutboundCallModeAction`. Omitted `contactInboxId`
 * resolves for "whichever WhatsApp inbox this contact has", same as the thread
 * header's call button; `.conversation(...)` is a key prefix of `.detail(...)`, so
 * invalidating it always refreshes both. Pass `options.enabled` when the trigger
 * only renders once calling is possible — otherwise a member without access gets a
 * deterministic 403 and `retry` (kept off here) would triple the wasted requests.
 */
export function useOutboundCallMode(
  workspaceId: string | undefined,
  conversationId: string | undefined,
  contactInboxId?: string,
  options?: { enabled?: boolean },
) {
  return useQuery<ResolveOutboundCallModeResult>({
    queryKey: contactInboxId
      ? outboundCallModeQueryKeys.detail(
          workspaceId,
          conversationId,
          contactInboxId,
        )
      : outboundCallModeQueryKeys.conversation(workspaceId, conversationId),
    queryFn: async () => {
      if (!(workspaceId && conversationId)) {
        throw new Error("missing workspaceId/conversationId")
      }
      const result = await resolveOutboundCallModeAction(workspaceId, {
        conversationId,
        contactInboxId,
      })
      if (!result?.data) {
        throw new Error(
          result?.serverError ?? "resolve-outbound-call-mode-failed",
        )
      }
      return result.data
    },
    enabled:
      Boolean(workspaceId && conversationId) && (options?.enabled ?? true),
    retry: false,
    staleTime: 30_000,
  })
}
