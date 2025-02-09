import {
  AuthType,
  type Oauth2PropsSchema,
  type TokenAuthSchema,
} from "@ahachat.ai/sdk"
import { OAuth2Client } from "google-auth-library"
import { google } from "googleapis"

export function getClient(oauth2Props: Oauth2PropsSchema) {
  const client = new OAuth2Client(
    oauth2Props.clientId,
    oauth2Props.clientSecret,
    oauth2Props.redirectUri,
  )
  if (oauth2Props.tokens) {
    client.setCredentials({
      access_token: oauth2Props.tokens.accessToken,
      expiry_date: new Date(oauth2Props.tokens.expiresAt).getTime(),
      refresh_token: oauth2Props.tokens.refreshToken,
    })
  }

  return client
}

export function generateAuthUrl(oauth2Props: Oauth2PropsSchema): string {
  return getClient(oauth2Props).generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
    state: btoa(JSON.stringify(oauth2Props.stateParams)),
  })
}

export async function getToken(
  oauth2Props: Oauth2PropsSchema,
): Promise<TokenAuthSchema> {
  const { tokens } = await getClient(oauth2Props).getToken(
    oauth2Props.code ?? "",
  )

  return {
    authType: AuthType.OAUTH2,
    issuedAt: new Date().toDateString(),
    accessToken: tokens.access_token || "",
    expiresAt: new Date(tokens.expiry_date ?? "").toISOString(),
    refreshToken: tokens.refresh_token || null,
    refreshTokenExpiresAt: null,
  }
}

export function getSheetsClient(oauth2Props: Oauth2PropsSchema) {
  const client = getClient(oauth2Props)

  return google.sheets({ version: "v4", auth: client })
}

export async function revokeToken(oauth2Props: Oauth2PropsSchema) {
  const client = getClient(oauth2Props)

  if (oauth2Props.tokens) {
    await client.revokeToken(oauth2Props.tokens.accessToken ?? "")
  }

  return true
}
