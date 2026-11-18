import { AuthType, type AuthValue } from "@chatbotx.io/sdk"

type FacebookAppCredential = {
  clientId: string
  clientSecret: string
  version: string
}

/** The Facebook user-level oauth2 authorization (not a Page token). */
export function buildFacebookUserAuth(
  credential: FacebookAppCredential,
  accessToken: string,
  redirectUrl: string,
): AuthValue {
  return {
    authType: AuthType.oauth2,
    clientId: credential.clientId,
    clientSecret: credential.clientSecret,
    redirectUrl,
    version: credential.version,
    tokens: { accessToken },
  }
}
