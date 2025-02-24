import {
  AuthType,
  type Oauth2AuthProps,
  type Oauth2AuthValue,
  SdkException,
} from "@ahachat.ai/sdk"
import { OAuth2Client } from "google-auth-library"
import { google } from "googleapis"

export function getClient(props: Oauth2AuthProps | Oauth2AuthValue) {
  const client = new OAuth2Client(
    props.clientId,
    props.clientSecret,
    props.redirectUri,
  )

  if ("tokens" in props) {
    client.setCredentials({
      access_token: props.tokens.accessToken,
      expiry_date: props.tokens.expiresAt
        ? new Date(props.tokens.expiresAt).getTime()
        : null,
      refresh_token: props.tokens.refreshToken,
    })
  }

  return client
}

export function generateAuthUrl(props: Oauth2AuthProps): string {
  return getClient(props).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
    state: btoa(JSON.stringify(props.stateParams)),
  })
}

export async function getToken(
  props: Oauth2AuthProps,
): Promise<Oauth2AuthValue> {
  if (!props.code) {
    throw new SdkException("Code is required")
  }

  const { tokens } = await getClient(props).getToken(props.code)

  return {
    authType: AuthType.OAUTH2,
    clientId: props.clientId,
    clientSecret: props.clientSecret,
    redirectUri: props.redirectUri,
    tokens: {
      accessToken: tokens.access_token || "",
      expiresAt: new Date(tokens.expiry_date ?? "").toISOString(),
      refreshToken: tokens.refresh_token ?? null,
      metadata: {
        scope: tokens.scope,
      },
    },
  }
}

export function getSheetsClient(props: Oauth2AuthValue) {
  const client = getClient(props)

  return google.sheets({ version: "v4", auth: client })
}

export async function revokeToken(auth: Oauth2AuthValue) {
  const client = getClient(auth)

  if (auth.tokens) {
    await client.revokeToken(auth.tokens.accessToken ?? "")
  }

  return true
}
