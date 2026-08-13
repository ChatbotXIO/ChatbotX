import { WHATSAPP_CAPI_SCOPE } from "@chatbotx.io/business"
import { debugTokenOrThrow } from "@chatbotx.io/integration-whatsapp/api/auth"

export async function hasWhatsappCapiScope(params: {
  accessToken: string
  appAccessToken: string
  wabaId: string
}): Promise<boolean> {
  const token = await debugTokenOrThrow(
    params.accessToken,
    params.appAccessToken,
  )
  const capiScope = token?.granular_scopes?.find(
    (scope) => scope.scope === WHATSAPP_CAPI_SCOPE,
  )

  if (!capiScope) {
    return false
  }

  return (
    !capiScope.target_ids ||
    capiScope.target_ids.length === 0 ||
    capiScope.target_ids.includes(params.wabaId)
  )
}
