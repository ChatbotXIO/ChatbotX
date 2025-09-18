import { OAuth2Client } from "google-auth-library"
import { google } from "googleapis"
import type { GoogleSheetsAuthValue, GoogleSheetsConfig } from "./schemas"

export function getClient(props: GoogleSheetsConfig | GoogleSheetsAuthValue) {
  const client = new OAuth2Client(
    props.clientId,
    props.clientSecret,
    props.redirectUrl,
  )

  if ("tokens" in props) {
    const tokens = props.tokens as GoogleSheetsAuthValue["tokens"]
    client.setCredentials({
      access_token: tokens.accessToken,
      expiry_date: tokens.expiresAt
        ? new Date(tokens.expiresAt).getTime()
        : null,
      refresh_token: tokens.refreshToken,
    })
  }

  return client
}

export function generateAuthUrl(props: GoogleSheetsConfig): string {
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

export function getSheetsClient(props: GoogleSheetsAuthValue) {
  const client = getClient(props)

  return google.sheets({ version: "v4", auth: client })
}

export async function revokeToken(auth: GoogleSheetsAuthValue): Promise<void> {
  const client = getClient(auth)

  await client.revokeToken(auth.tokens.accessToken ?? "")
}
