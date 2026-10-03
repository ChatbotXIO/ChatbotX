export const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })

export const oauthCredential = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "https://legacy.example.test/callback",
} as const

export const facebookOauthCredential = {
  ...oauthCredential,
  version: "v23.0",
} as const

export const expectStateVerbatim = (
  url: string | undefined,
  expectedState: string,
) => {
  if (!url) {
    throw new Error("OAuth authorization URL is missing")
  }

  const actualState = new URL(url).searchParams.get("state")
  if (actualState !== expectedState) {
    throw new Error(
      `Expected OAuth state ${expectedState}, received ${actualState}`,
    )
  }
}
