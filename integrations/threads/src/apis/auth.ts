import { AuthType, type Oauth2AuthValue } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION, THREADS_SCOPES } from "../constants"
import { rescue } from "../exception"
import { threadsGraphClient } from "../lib/http-client"

export function generateAuthUrl({
  clientId,
  redirectUrl,
  stateParams,
}: {
  clientId: string
  redirectUrl: string
  stateParams?: Record<string, unknown>
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUrl,
    response_type: "code",
    scope: THREADS_SCOPES.join(","),
    state: Buffer.from(JSON.stringify(stateParams ?? {})).toString("base64"),
  })

  return `https://threads.com/oauth/authorize?${params.toString()}`
}

type ThreadsTokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
}

function exchangeLongLivedToken(props: {
  clientSecret: string
  accessToken: string
}): Promise<ThreadsTokenResponse> {
  return rescue(
    "access_token",
    async () =>
      await threadsGraphClient.get<ThreadsTokenResponse>("access_token", {
        searchParams: {
          grant_type: "th_exchange_token",
          client_secret: props.clientSecret,
          access_token: props.accessToken,
        },
      }),
  )
}

export function exchangeCodeForToken(
  settings: { clientId: string; clientSecret: string; version?: string },
  code: string,
  redirectUrl: string,
): Promise<{ accessToken: string; expiresAt?: string }> {
  const endpoint = "oauth/access_token"

  return rescue(endpoint, async () => {
    const shortLivedToken = await threadsGraphClient.post<ThreadsTokenResponse>(
      endpoint,
      {
        body: new URLSearchParams({
          client_id: settings.clientId,
          client_secret: settings.clientSecret,
          redirect_uri: redirectUrl,
          code,
          grant_type: "authorization_code",
        }),
      },
    )
    const response = await exchangeLongLivedToken({
      clientSecret: settings.clientSecret,
      accessToken: shortLivedToken.access_token,
    })

    return {
      accessToken: response.access_token,
      expiresAt: response.expires_in
        ? new Date(Date.now() + response.expires_in * 1000).toISOString()
        : undefined,
    }
  })
}

export function refreshAccessToken(props: {
  accessToken: string
}): Promise<{ accessToken: string; expiresAt?: string }> {
  return rescue("refresh_access_token", async () => {
    const response = await threadsGraphClient.get<ThreadsTokenResponse>(
      "refresh_access_token",
      {
        searchParams: {
          grant_type: "th_refresh_token",
          access_token: props.accessToken,
        },
      },
    )

    return {
      accessToken: response.access_token,
      expiresAt: response.expires_in
        ? new Date(Date.now() + response.expires_in * 1000).toISOString()
        : undefined,
    }
  })
}

export type ThreadsOAuthProfile = {
  id: string
  username: string
  name: string
  threads_profile_picture_url?: string
  threads_biography?: string
}

export function getThreadsProfile(
  accessToken: string,
  version = DEFAULT_API_VERSION,
): Promise<ThreadsOAuthProfile> {
  return rescue(`${version}/me`, async () => {
    const profile = await threadsGraphClient.get<
      Omit<ThreadsOAuthProfile, "name">
    >(`${version}/me`, {
      searchParams: {
        fields: "id,username,threads_profile_picture_url,threads_biography",
        access_token: accessToken,
      },
    })

    return {
      ...profile,
      name: profile.username,
    }
  })
}

export function buildThreadsAuthValue(props: {
  clientId: string
  clientSecret: string
  redirectUrl: string
  version?: string
  accessToken: string
  expiresAt?: string
  threadsUserId: string
  username: string
}): Oauth2AuthValue {
  return {
    authType: AuthType.oauth2,
    clientId: props.clientId,
    clientSecret: props.clientSecret,
    redirectUrl: props.redirectUrl,
    version: props.version,
    tokens: {
      accessToken: props.accessToken,
      expiresAt: props.expiresAt,
    },
    metadata: {
      threadsUserId: props.threadsUserId,
      username: props.username,
      version: props.version ?? DEFAULT_API_VERSION,
    },
  }
}
