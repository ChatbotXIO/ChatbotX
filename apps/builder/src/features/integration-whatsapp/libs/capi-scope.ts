import { WHATSAPP_CAPI_SCOPE } from "@chatbotx.io/business"
import {
  type DebugTokenGranularScope,
  debugTokenOrThrow,
} from "@chatbotx.io/integration-whatsapp/api/auth"

export function grantedScopesForWaba(
  granularScopes: DebugTokenGranularScope[] | undefined,
  wabaId: string,
): string[] {
  return (granularScopes ?? [])
    .filter(
      (scope) =>
        !scope.target_ids ||
        scope.target_ids.length === 0 ||
        scope.target_ids.includes(wabaId),
    )
    .map((scope) => scope.scope)
}

export async function getWhatsappGrantedScopes(params: {
  accessToken: string
  appAccessToken: string
  wabaId: string
}): Promise<string[]> {
  const token = await debugTokenOrThrow(
    params.accessToken,
    params.appAccessToken,
  )
  return grantedScopesForWaba(token?.granular_scopes, params.wabaId)
}

export async function hasWhatsappCapiScope(params: {
  accessToken: string
  appAccessToken: string
  wabaId: string
}): Promise<boolean> {
  const scopes = await getWhatsappGrantedScopes(params)
  return scopes.includes(WHATSAPP_CAPI_SCOPE)
}
