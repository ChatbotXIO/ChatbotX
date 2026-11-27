import ky from "ky"
import { LineAPIException } from "../exception"
import type { LineTokenResponse } from "../schema"
import { LINE_API_HOST } from "./client"

type IssueProps = { channelId: string; channelSecret: string }

export async function issueAccessToken({
  channelId,
  channelSecret,
}: IssueProps): Promise<{ accessToken: string; expiresAt: string }> {
  const response = await ky.post(`${LINE_API_HOST}/v2/oauth/accessToken`, {
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: channelId,
      client_secret: channelSecret,
    }),
    timeout: 30_000,
    throwHttpErrors: false,
    retry: { limit: 0 },
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as
      | { error?: string; error_description?: string }
      | undefined
    throw new LineAPIException(
      body?.error_description ?? "Failed to issue LINE access token",
      response.status,
      body?.error ?? "lineError",
      null,
      body?.error,
      body,
    )
  }

  const data = (await response.json()) as LineTokenResponse
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }
}
