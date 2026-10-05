import { describe, expect, test, vi } from "vitest"
import type * as ClientModule from "../src/client"
import { integration } from "../src/integration"

const mocks = vi.hoisted(() => ({
  getCalendarClient: vi.fn(),
}))

vi.mock("../src/client", async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>()
  return { ...actual, getCalendarClient: mocks.getCalendarClient }
})

const connection = integration.connection
if (!connection) {
  throw new Error(
    "Google Calendar integration must define a connection provider",
  )
}

const auth = {
  authType: "oauth2" as const,
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUrl: "https://app.example.test/callback",
  tokens: { accessToken: "access-token" },
  metadata: { providerCalendarId: "primary" },
}

describe("Google Calendar connection.verify", () => {
  test("marks a wrapped Google 401 response as revoked", async () => {
    mocks.getCalendarClient.mockReturnValue({
      calendarList: {
        get: vi.fn().mockRejectedValue(
          Object.assign(new Error("Invalid Credentials"), {
            response: { status: 401 },
          }),
        ),
      },
    })

    await expect(connection.verify({ auth })).resolves.toMatchObject({
      ok: false,
      revoked: true,
    })
  })
})
