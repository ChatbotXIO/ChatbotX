import ky from "ky"
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

  const res = await ky
    .post(`https://graph.facebook.com/${version}/oauth/access_token`, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret as string,
        redirect_uri: redirectUri,
      }),
    })
    .json<{
      access_token: string
      token_type: string
      expires_in: number
    }>()

  if (!res.access_token) {
    throw new Error("Can't get access token from Facebook")
  }
  return await exchangeForLongLivedToken(res.access_token, props)
}

export async function exchangeForLongLivedToken(
  token: string,
  props: MessengerConfig,
): Promise<string> {
  const res = await ky
    .get(`https://graph.facebook.com/${props.version}/oauth/access_token`, {
      searchParams: {
        grant_type: "fb_exchange_token",
        client_id: props.clientId,
        client_secret: props.clientSecret as string,
        fb_exchange_token: token,
      },
    })
    .json<{
      access_token: string
      token_type: string
      expires_in: number
    }>()
  if (!res.access_token) {
    throw new Error("Can't convert access token from long lived token")
  }
  return res.access_token
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
