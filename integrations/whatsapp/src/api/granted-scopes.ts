import { WHATSAPP_CAPI_SCOPE } from "@chatbotx.io/business/integration-whatsapp/auth-schema"
import type { DebugTokenGranularScope } from "./auth"

/**
 * Permissions whose `debug_token` `target_ids` never hold the WABA id: Meta
 * records the `whatsapp_business_manage_events` grant against the WABA's
 * Business Presence account (Meta support case 28039248102433859), and there
 * is no Graph field mapping one to the other. The grant is accepted on presence
 * alone; a WABA that truly lacks it gets Meta's `(#200)` error on send.
 */
const BUSINESS_PRESENCE_SCOPES: ReadonlySet<string> = new Set([
  WHATSAPP_CAPI_SCOPE,
])

const isGrantedForWaba = (
  scope: DebugTokenGranularScope,
  wabaId: string,
): boolean =>
  BUSINESS_PRESENCE_SCOPES.has(scope.scope) ||
  !scope.target_ids?.length ||
  scope.target_ids.includes(wabaId)

/** The permissions a debugged token grants for one WABA. */
export function grantedScopesForWaba(
  granularScopes: DebugTokenGranularScope[] | undefined,
  wabaId: string,
): string[] {
  return (granularScopes ?? [])
    .filter((scope) => isGrantedForWaba(scope, wabaId))
    .map((scope) => scope.scope)
}
