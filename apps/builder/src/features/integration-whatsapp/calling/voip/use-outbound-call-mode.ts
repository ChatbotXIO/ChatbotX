"use client"

import { useQuery } from "@tanstack/react-query"
import type { ResolveOutboundCallModeResult } from "../actions/resolve-outbound-call-mode.action"
import { resolveOutboundCallModeAction } from "../actions/resolve-outbound-call-mode.action"
import { outboundCallModeQueryKeys } from "./outbound-call-mode-query-key"

/**
 * Resolves which call control (browser-WebRTC VoIP, or none) should render
 * for a conversation — see `resolveOutboundCallModeAction`. TanStack Query
 * wraps the server action (not an oRPC procedure) directly: cached per
 * `workspaceId`/`conversationId`(/`contactInboxId`), refetched on remount,
 * and never blocking the caller's own render — render the control
 * immediately and let this resolve in the background.
 *
 * `contactInboxId` pins resolution to one SPECIFIC WhatsApp number of the
 * conversation's contact (e.g. the contact panel dialing one of several) —
 * omitted, it resolves for "whichever WhatsApp inbox this contact has", the
 * same as the thread header's call button. Keyed with
 * `outboundCallModeQueryKeys.detail(...)` when supplied, `.conversation(...)`
 * otherwise — every invalidation site uses `.conversation(...)`, which
 * (being a key prefix of `.detail(...)`) refreshes both.
 *
 * `options.enabled`, when supplied, gates the query ADDITIONALLY to the
 * built-in workspaceId/conversationId presence check — a caller that only
 * renders its trigger once calling itself is possible (e.g. a call-back
 * control that also needs `voipCallContext` to exist) must pass this,
 * otherwise the action still fires — and, since a member without calling
 * access gets a deterministic 403 from `resolveOutboundCallModeAction`,
 * TanStack Query's default retry (3x) turns that into 3 avoidable requests
 * per card. `retry` is therefore always off for this query: a 403 will
 * never succeed on retry.
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
