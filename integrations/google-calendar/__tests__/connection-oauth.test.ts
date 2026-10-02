import { beforeEach, describe, expect, test, vi } from "vitest"
import type * as CalendarsModule from "../src/apis/calendars"
import type * as ClientModule from "../src/client"

const mocks = vi.hoisted(() => ({
  generateAuthUrl: vi.fn(),
  getClient: vi.fn(),
  getToken: vi.fn(),
  verifyCalendarAccess: vi.fn(),
}))

vi.mock("../src/client", async (importOriginal) => {
  // Vitest loads the original at runtime so this mock can replace only getClient.
  const actual = await importOriginal<typeof ClientModule>()
  return {
    ...actual,
    getClient: mocks.getClient,
  }
})

vi.mock("../src/apis/calendars", async (importOriginal) => {
  // Vitest loads the original at runtime so this mock can replace only verifyCalendarAccess.
  const actual = await importOriginal<typeof CalendarsModule>()
  return {
    ...actual,
    verifyCalendarAccess: mocks.verifyCalendarAccess,
  }
})

// The integration must load after its dependencies are mocked.
const { integration } = await import("../src/integration")

const connection = integration.connection
if (!connection) {
  throw new Error(
    "Google Calendar integration must define a connection provider",
  )
}

const credential = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUrl: "https://legacy.example.test/callback",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getClient.mockReturnValue({
    generateAuthUrl: mocks.generateAuthUrl,
    getToken: mocks.getToken,
  })
})

describe("Google Calendar connection.authorizeUrl", () => {
  test("passes state through verbatim, not JSON/base64-wrapped", () => {
    mocks.generateAuthUrl.mockReturnValue(
      "https://accounts.google.com/o/oauth2/v2/auth",
    )

    const url = connection.authorizeUrl?.({
      credential,
      callbackUrl: "https://app.example.test/connections/callback",
      state: "session-1.abc123",
    })

    expect(url).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(mocks.getClient).toHaveBeenCalledWith({
      ...credential,
      redirectUrl: "https://app.example.test/connections/callback",
    })
    expect(mocks.generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
      state: "session-1.abc123",
    })
  })
})

describe("Google Calendar connection.exchangeCode", () => {
  test("returns the calendar-verified OAuth auth value", async () => {
    mocks.getToken.mockResolvedValue({
      tokens: {
        access_token: "access-token",
        expiry_date: 1_700_000_000_000,
        refresh_token: "refresh-token",
        scope: "https://www.googleapis.com/auth/calendar.events",
      },
    })
    mocks.verifyCalendarAccess.mockResolvedValue({
      providerCalendarId: "calendar@example.test",
      email: "calendar@example.test",
    })

    const auth = await connection.exchangeCode?.({
      code: "auth-code",
      callbackUrl: "https://app.example.test/connections/callback",
      credential,
    })

    expect(mocks.getToken).toHaveBeenCalledWith("auth-code")
    expect(mocks.verifyCalendarAccess).toHaveBeenCalledWith(
      {
        authType: "oauth2",
        clientId: "client-1",
        clientSecret: "secret-1",
        redirectUrl: "",
        tokens: {
          accessToken: "access-token",
          expiresAt: "2023-11-14T22:13:20.000Z",
          refreshToken: "refresh-token",
        },
        metadata: {
          scope: "https://www.googleapis.com/auth/calendar.events",
        },
      },
      "primary",
    )
    expect(auth).toEqual({
      authType: "oauth2",
      clientId: "client-1",
      clientSecret: "secret-1",
      redirectUrl: "",
      tokens: {
        accessToken: "access-token",
        expiresAt: "2023-11-14T22:13:20.000Z",
        refreshToken: "refresh-token",
      },
      metadata: {
        scope: "https://www.googleapis.com/auth/calendar.events",
        providerCalendarId: "calendar@example.test",
        email: "calendar@example.test",
      },
    })
  })
})
