import type { MessengerConfig } from "./schemas"

export const scope = [
  "email",
  "public_profile",
  "pages_manage_ads",
  "pages_manage_metadata",
  "pages_read_engagement",
  "pages_read_user_content",
  "pages_manage_posts",
  "pages_manage_engagement",
  "pages_messaging",
].join(",")

export async function convertCodeToAccessToken(
  code: string,
  props: MessengerConfig,
): Promise<string> {
  const { clientId, clientSecret, redirectUri, version } = props

  const res = await fetch(
    `https://graph.facebook.com/${version}/oauth/access_token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret as string,
        redirect_uri: redirectUri,
      }),
    },
  )

  const data = (await res.json()) as { access_token: string }
  if (!res.ok) {
    throw new Error("Can't get access token from Facebook")
  }
  return await exchangeForLongLivedToken(data.access_token, props)
}

export async function exchangeForLongLivedToken(
  token: string,
  props: MessengerConfig,
): Promise<string> {
  const url = new URL(
    `https://graph.facebook.com/${props.version}/oauth/access_token`,
  )
  url.searchParams.set("grant_type", "fb_exchange_token")
  url.searchParams.set("client_id", props.clientId)
  url.searchParams.set("client_secret", props.clientSecret as string)
  url.searchParams.set("fb_exchange_token", token)

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`Facebook token exchange failed: ${res.statusText}`)
  }
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export function generateAuthUrl(props: MessengerConfig): string {
  const { clientId, redirectUri, stateParams, version } = props
  const base = `https://www.facebook.com/${version}/dialog/oauth`
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    state: btoa(JSON.stringify(stateParams)),
    response_type: "code",
  })

  return `${base}?${params.toString()}`
}
