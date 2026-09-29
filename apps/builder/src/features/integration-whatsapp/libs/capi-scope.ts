import { WHATSAPP_CAPI_SCOPE } from "@chatbotx.io/business/integration-whatsapp/auth-schema"
import { debugTokenOrThrow } from "@chatbotx.io/integration-whatsapp/api/auth"
import { grantedScopesForWaba } from "@chatbotx.io/integration-whatsapp/api/granted-scopes"

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
