import ky from "ky"
import type { ZaloConfig, ZaloTokens, zaloOAProfile } from "../schemas/app"

export async function convertCodeToTokens(
  code: string,
  props: ZaloConfig,
): Promise<ZaloTokens> {
  const { clientId, clientSecret, version } = props
  const res = await ky
    .post(`https://oauth.zaloapp.com/${version}/oa/access_token`, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        secret_key: clientSecret as string,
      },
      body: new URLSearchParams({
        code,
        app_id: clientId,
        redirect_uri: `${process.env.NEXT_PUBLIC_BUILDER_URL}/integrations/zalo/callback`,
        grant_type: "authorization_code",
      }),
    })
    .json<ZaloTokens>()

  if (!res.access_token) {
    throw new Error("Can't get access token from Zalo")
  }
  return res
}

export async function getZaloOAProfile(
  accessToken: string,
): Promise<zaloOAProfile> {
  const res = await ky
    .get("https://openapi.zalo.me/v2.0/oa/getoa", {
      headers: {
        access_token: accessToken,
      },
    })
    .json<{ data: zaloOAProfile }>()

  return res.data
}
