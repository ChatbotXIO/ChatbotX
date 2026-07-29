import { DEFAULT_API_VERSION, META_CATALOG_SCOPES } from "../constants"

const FACEBOOK_OAUTH_BASE = "https://www.facebook.com"

export function generateCatalogAuthUrl(input: {
  clientId: string
  version?: string
  redirectUrl: string
  stateParams?: Record<string, unknown>
}): string {
  const version = input.version ?? DEFAULT_API_VERSION
  const params = new URLSearchParams({
    // Without this, Facebook silently skips any permission the user declined
    // before and returns a token missing `catalog_management` — the reconnect
    // then looks successful and every sync fails afterwards.
    client_id: input.clientId,
    redirect_uri: input.redirectUrl,
    auth_type: "rerequest",
    scope: META_CATALOG_SCOPES.join(","),
    response_type: "code",
    state: Buffer.from(JSON.stringify(input.stateParams ?? {})).toString(
      "base64",
    ),
  })
  return `${FACEBOOK_OAUTH_BASE}/${version}/dialog/oauth?${params.toString()}`
}

export {
  exchangeCodeForToken,
  exchangeLongLivedToken,
} from "@chatbotx.io/integration-facebook-ads/apis/auth"
