import { expect } from "vitest"

export const oauthCredential = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "https://legacy.example.test/callback",
} as const

export const expectStateVerbatim = (
  url: string | undefined,
  expectedState: string,
) => {
  expect(url).toBeDefined()
  expect(new URL(url as string).searchParams.get("state")).toBe(expectedState)
}
