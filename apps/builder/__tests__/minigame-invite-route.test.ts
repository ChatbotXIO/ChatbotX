// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockCookieSet, mockRedirect } = vi.hoisted(() => ({
  mockCookieSet: vi.fn(),
  mockRedirect: vi.fn((url: string) => {
    // Mirrors the real `redirect()`, which throws to unwind the handler.
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: mockCookieSet })),
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

const { GET } = await import("@/app/minigames/invite/route")
const { signMinigameReferralToken } = await import(
  "@chatbotx.io/encryption/minigame-referral-token"
)

const request = (query: string) =>
  ({
    nextUrl: new URL(`https://app.example.com/minigames/invite${query}`),
  }) as never

const redirectedTo = async (req: never) => {
  try {
    await GET(req)
  } catch (error) {
    return (error as Error).message.replace("NEXT_REDIRECT:", "")
  }
  throw new Error("expected the handler to redirect")
}

describe("GET /minigames/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("remembers a valid invite and sends the visitor to the landing notice", async () => {
    const token = await signMinigameReferralToken({
      workspaceId: "workspace-1",
      minigameId: "minigame-1",
      referrerContactId: "contact-1",
    })

    const destination = await redirectedTo(
      request(`?minigameId=minigame-1&ref=${token}`),
    )

    expect(destination).toBe("/minigames?minigameId=minigame-1&invited=1")
    expect(mockCookieSet).toHaveBeenCalledWith("mg_ref_minigame-1", token, {
      httpOnly: true,
      secure: false,
      // Must not be `strict`: the click is a cross-site top-level GET from a
      // chat app, which `strict` would strip the cookie from.
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/minigames",
    })
  })

  test("refuses a token minted for a different minigame", async () => {
    const token = await signMinigameReferralToken({
      workspaceId: "workspace-1",
      minigameId: "minigame-OTHER",
      referrerContactId: "contact-1",
    })

    const destination = await redirectedTo(
      request(`?minigameId=minigame-1&ref=${token}`),
    )

    expect(destination).toBe("/minigames?minigameId=minigame-1&invited=expired")
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  test("refuses an expired token", async () => {
    const token = await signMinigameReferralToken(
      {
        workspaceId: "workspace-1",
        minigameId: "minigame-1",
        referrerContactId: "contact-1",
      },
      -1,
    )

    const destination = await redirectedTo(
      request(`?minigameId=minigame-1&ref=${token}`),
    )

    expect(destination).toBe("/minigames?minigameId=minigame-1&invited=expired")
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  test("refuses a malformed token", async () => {
    const destination = await redirectedTo(
      request("?minigameId=minigame-1&ref=not-a-token"),
    )

    expect(destination).toBe("/minigames?minigameId=minigame-1&invited=expired")
    expect(mockCookieSet).not.toHaveBeenCalled()
  })

  test("falls back to the plain play route when the link is incomplete", async () => {
    expect(await redirectedTo(request("?minigameId=minigame-1"))).toBe(
      "/minigames",
    )
    expect(mockCookieSet).not.toHaveBeenCalled()
  })
})
