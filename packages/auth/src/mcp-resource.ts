import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client"
import { getMcpResourceUrl } from "./keys"
import type { Auth } from "./server"

export type McpAccessTokenSubject = {
  clientId: string
  userId: string
}

export const verifyMcpAccessToken = async (
  auth: Auth,
  accessToken: string,
): Promise<McpAccessTokenSubject | null> => {
  const claims = await oauthProviderResourceClient(auth)
    .getActions()
    .verifyBearerToken(accessToken, {
      verifyOptions: { audience: getMcpResourceUrl() },
    })

  if (typeof claims.client_id !== "string" || typeof claims.sub !== "string") {
    return null
  }

  return {
    clientId: claims.client_id,
    userId: claims.sub,
  }
}

export const getMcpAuthorizationServerMetadata = (auth: Auth) =>
  oauthProviderAuthServerMetadata(auth, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  })
