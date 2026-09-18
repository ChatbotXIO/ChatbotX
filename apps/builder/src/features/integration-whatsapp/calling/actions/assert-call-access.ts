import { canCallConversation, canReadCall } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import type { PermissionsInput } from "@/lib/auth/permission-routes"

/** The `ChatbotXException.code` every D3 call-access denial carries,
 * regardless of which action threw it (outbound dial, mode resolution,
 * permission request, TURN) — a caller must not be able to distinguish
 * "no such call/conversation" from "not your call" by probing the code. */
export const CALL_ACCESS_DENIED_CODE = "callAccessDenied"
const CALL_ACCESS_DENIED_HTTP_STATUS = 403

/** The `ChatbotXException.code` every P5 `artifact`-scope read denial
 * carries (recording URL, transcript, summary, generate-summary) — kept
 * distinct from {@link CALL_ACCESS_DENIED_CODE} since this guards a READ
 * of an already-terminated call, not starting/joining one. */
export const CALL_ARTIFACT_ACCESS_DENIED_CODE = "callArtifactAccessDenied"

/**
 * The one place every calling action that already has a `conversationId`
 * (outbound dial, outbound mode resolution, permission requests) runs the
 * D3 authorization gate — action layer, not business layer, because
 * throwing here needs a TRANSLATED message (`whatsapp.calls.errors.
 * voipCallAccessDenied`), and `packages/business` does not own i18n.
 * Wraps the non-throwing `canCallConversation` so the D3 predicate itself
 * (`isEligibleForConversationCall`) is never duplicated. `answer-voip-call.
 * action.ts` calls `canCallConversation` directly instead — a denial there
 * is an expected, non-exceptional outcome (`{ outcome: "cannotAnswer" }`),
 * not a thrown error.
 */
export async function assertCallAccessOrThrow(input: {
  workspaceId: string
  conversationId: string
  userId: string
}): Promise<void> {
  const allowed = await canCallConversation(input)
  if (allowed) {
    return
  }
  const t = await getTranslations()
  throw new ChatbotXException(
    t("whatsapp.calls.errors.voipCallAccessDenied"),
    CALL_ACCESS_DENIED_CODE,
    CALL_ACCESS_DENIED_HTTP_STATUS,
  )
}

/**
 * P5 item 3 (plan D4/D8) — the one place every `artifact`-scope read
 * (recording URL, transcript, summary, generate-summary) runs
 * `canReadCall({ scope: "artifact" })` and throws a TRANSLATED denial —
 * same reasoning as {@link assertCallAccessOrThrow}: the non-throwing core
 * check lives in `packages/business` (`canReadCall`), the translated
 * exception lives here since business code does not own i18n. All four
 * artifact actions keep their current client
 * (`workspaceActionClientAllowExpired`/`workspaceActionClient`) — D8 says
 * reading call artifacts follows the normal read rules, unaffected by a
 * support session or an expired/blocked workspace.
 *
 * C1 fix: takes the caller's already-resolved `member` (`ctx.user.id` +
 * `ctx.workspaceMemberPermissions`, both already loaded by
 * `workspaceActionClientAllowExpired` via `resolveWorkspaceAccess`) instead
 * of a bare `userId` `canReadCall` would have to re-resolve from
 * `WorkspaceMember` itself — that re-resolution is exactly what denied a
 * platform support session (synthetic membership, no real `WorkspaceMember`
 * row) for every artifact read.
 */
export async function assertCanReadCallArtifactOrThrow(input: {
  workspaceId: string
  whatsappCallId: string
  member: { userId: string; permissions: PermissionsInput }
}): Promise<void> {
  const allowed = await canReadCall({ ...input, scope: "artifact" })
  if (allowed) {
    return
  }
  const t = await getTranslations()
  throw new ChatbotXException(
    t("whatsapp.calls.errors.callArtifactAccessDenied"),
    CALL_ARTIFACT_ACCESS_DENIED_CODE,
    CALL_ACCESS_DENIED_HTTP_STATUS,
  )
}
