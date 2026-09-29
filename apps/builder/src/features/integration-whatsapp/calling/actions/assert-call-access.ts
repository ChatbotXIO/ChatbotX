import { canCallConversation, canReadCall } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import type { PermissionsInput } from "@/lib/auth/permission-routes"

/**
 * The ChatbotXException.code every call-access denial carries, regardless of
 * which action threw it - a caller must not be able to distinguish "no such
 * call/conversation" from "not your call" by probing the code.
 */
export const CALL_ACCESS_DENIED_CODE = "callAccessDenied"
const CALL_ACCESS_DENIED_HTTP_STATUS = 403

/**
 * The ChatbotXException.code every artifact-scope read denial carries
 * (recording URL, transcript, summary, generate-summary) - kept distinct from
 * CALL_ACCESS_DENIED_CODE since this guards a read of an already-terminated
 * call, not starting/joining one.
 */
export const CALL_ARTIFACT_ACCESS_DENIED_CODE = "callArtifactAccessDenied"

/**
 * Throws here rather than in packages/business because the denial message
 * needs i18n, which business does not own. answer-voip-call.action.ts calls
 * canCallConversation directly instead, since a denial there is expected, not
 * exceptional.
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
 * Takes the caller's already-resolved member instead of a bare userId, since
 * canReadCall re-resolving from WorkspaceMember itself would deny a platform
 * support session (synthetic membership, no real WorkspaceMember row).
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
