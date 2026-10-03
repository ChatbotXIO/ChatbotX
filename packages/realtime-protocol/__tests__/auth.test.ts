import { SignJWT } from "jose"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  CLOCK_TOLERANCE_SECONDS,
  extractBearerToken,
  REALTIME_MEMBER_REVOKED_TTL_SECONDS,
  REALTIME_TOKEN_PURPOSE,
  REALTIME_TOKEN_TTL_SECONDS,
  signGuestConnectToken,
  signMemberConnectToken,
  signPresenceReportToken,
  verifyGuestConnectToken,
  verifyMemberConnectToken,
  verifyPresenceReportToken,
  verifyRealtimeToken,
} from "../src/auth"

const SECRET = "a".repeat(32)
const OTHER_SECRET = "b".repeat(32)

it("keeps a revocation marker valid for every still-tolerated token", () => {
  expect(REALTIME_MEMBER_REVOKED_TTL_SECONDS).toBeGreaterThanOrEqual(
    REALTIME_TOKEN_TTL_SECONDS + CLOCK_TOLERANCE_SECONDS,
  )
})

describe("signPresenceReportToken / verifyPresenceReportToken (generic sign/verify mechanics)", () => {
  it("verifies a token signed for the same audience and purpose", async () => {
    const token = await signPresenceReportToken(
      { workspaceId: "ws_1", bodyHash: "hash-1" },
      SECRET,
    )

    await expect(
      verifyPresenceReportToken(token, "ws_1", SECRET),
    ).resolves.toBeDefined()
  })

  it("rejects when the audience id does not match (room-claim mismatch)", async () => {
    const token = await signPresenceReportToken(
      { workspaceId: "ws_1", bodyHash: "hash-1" },
      SECRET,
    )

    await expect(
      verifyPresenceReportToken(token, "ws_2", SECRET),
    ).rejects.toThrow()
  })

  it("rejects when signed with a different secret", async () => {
    const token = await signPresenceReportToken(
      { workspaceId: "ws_1", bodyHash: "hash-1" },
      SECRET,
    )

    await expect(
      verifyPresenceReportToken(token, "ws_1", OTHER_SECRET),
    ).rejects.toThrow()
  })

  it("carries its claim through the payload", async () => {
    const token = await signPresenceReportToken(
      { workspaceId: "ws_1", bodyHash: "hash-1" },
      SECRET,
    )

    const claims = await verifyPresenceReportToken(token, "ws_1", SECRET)

    expect(claims.bodyHash).toBe("hash-1")
  })

  it("embeds the purpose claim in the signed payload (undecoded)", async () => {
    const token = await signPresenceReportToken(
      { workspaceId: "ws_1", bodyHash: "hash-1" },
      SECRET,
    )

    const payload = await verifyRealtimeToken(
      token,
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.presenceReport,
      SECRET,
    )

    expect(payload.purpose).toBe(REALTIME_TOKEN_PURPOSE.presenceReport)
  })

  it("rejects a token minted for a different purpose — a member-connect token must not verify as a presence-report token (MEDIUM-3)", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1", chatScope: "all" },
      SECRET,
    )

    await expect(
      verifyPresenceReportToken(token, "ws_1", SECRET),
    ).rejects.toThrow()
  })

  it("rejects a purpose-less token", async () => {
    const legacyToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setAudience("workspace:ws_1")
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(SECRET))

    await expect(
      verifyPresenceReportToken(legacyToken, "ws_1", SECRET),
    ).rejects.toThrow()
  })
})

describe("signMemberConnectToken / verifyMemberConnectToken", () => {
  it("verifies a token minted for the same workspace room", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1", chatScope: "all" },
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_1", SECRET),
    ).resolves.toEqual({
      userId: "u_1",
      chatScope: "all",
      teamIds: [],
      iat: expect.any(Number),
      iatMs: expect.any(Number),
    })
  })

  it("preserves assigned-team scope in a member token", async () => {
    const token = await signMemberConnectToken(
      {
        workspaceId: "ws_1",
        userId: "u_1",
        chatScope: "assigned",
        teamIds: ["team_1", "team_2"],
      },
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_1", SECRET),
    ).resolves.toEqual({
      userId: "u_1",
      chatScope: "assigned",
      teamIds: ["team_1", "team_2"],
      iat: expect.any(Number),
      iatMs: expect.any(Number),
    })
  })

  it("rejects a cross-room replay — token minted for a different workspace", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1", chatScope: "all" },
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_2", SECRET),
    ).rejects.toThrow()
  })

  it("rejects a token missing the userId claim", async () => {
    // Hand-signed with the right purpose/audience but no claims at all,
    // simulating a token that never carried `userId` — must never be
    // silently trusted.
    const token = await new SignJWT({
      purpose: REALTIME_TOKEN_PURPOSE.memberConnect,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setAudience("workspace:ws_1")
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(SECRET))

    await expect(
      verifyMemberConnectToken(token, "ws_1", SECRET),
    ).rejects.toThrow()
  })

  it("rejects a token signed with a different secret", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1", chatScope: "all" },
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_1", OTHER_SECRET),
    ).rejects.toThrow()
  })

  it("rejects a purpose-less token — member-connect requires a purpose claim", async () => {
    const legacyShapedToken = await new SignJWT({ userId: "u_1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setAudience("workspace:ws_1")
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(SECRET))

    await expect(
      verifyMemberConnectToken(legacyShapedToken, "ws_1", SECRET),
    ).rejects.toThrow()
  })

  it("a freshly minted member-connect token must never verify as a presence report — no cross-purpose confusion despite their shared workspace:<id> audience", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1", chatScope: "all" },
      SECRET,
    )

    await expect(
      verifyRealtimeToken(
        token,
        { kind: "workspace", id: "ws_1" },
        REALTIME_TOKEN_PURPOSE.presenceReport,
        SECRET,
      ),
    ).rejects.toThrow()
  })

  it("a freshly minted presence-report token must never verify as a member-connect token — same cross-purpose confusion, reversed", async () => {
    const token = await signPresenceReportToken(
      { workspaceId: "ws_1", bodyHash: "hash-1" },
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_1", SECRET),
    ).rejects.toThrow()
  })
})

describe("signGuestConnectToken / verifyGuestConnectToken", () => {
  it("binds the guest token to its conversation and workspace", async () => {
    const token = await signGuestConnectToken(
      {
        guestConversationId: "guest-conversation-1",
        workspaceId: "workspace-1",
      },
      SECRET,
    )

    await expect(
      verifyGuestConnectToken(token, "guest-conversation-1", SECRET),
    ).resolves.toEqual({
      guestConversationId: "guest-conversation-1",
      workspaceId: "workspace-1",
    })
    await expect(
      verifyGuestConnectToken(token, "guest-conversation-2", SECRET),
    ).rejects.toThrow()
  })

  it("rejects an expired guest token", async () => {
    const token = await new SignJWT({
      guestConversationId: "guest-conversation-1",
      purpose: REALTIME_TOKEN_PURPOSE.guestConnect,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("guest:guest-conversation-1")
      .setExpirationTime("-10s")
      .sign(new TextEncoder().encode(SECRET))

    await expect(
      verifyGuestConnectToken(token, "guest-conversation-1", SECRET),
    ).rejects.toThrow()
  })
})

describe("guest token expiry tolerance", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("accepts a token expired four seconds ago but rejects one expired six seconds ago", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-03T12:00:00.000Z"))
    const recentlyExpiredToken = await new SignJWT({
      guestConversationId: "guest-conversation-1",
      purpose: REALTIME_TOKEN_PURPOSE.guestConnect,
      workspaceId: "workspace-1",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("guest:guest-conversation-1")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 4)
      .sign(new TextEncoder().encode(SECRET))

    await expect(
      verifyGuestConnectToken(
        recentlyExpiredToken,
        "guest-conversation-1",
        SECRET,
      ),
    ).resolves.toEqual({
      guestConversationId: "guest-conversation-1",
      workspaceId: "workspace-1",
    })

    const expiredToken = await new SignJWT({
      guestConversationId: "guest-conversation-1",
      purpose: REALTIME_TOKEN_PURPOSE.guestConnect,
      workspaceId: "workspace-1",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("guest:guest-conversation-1")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 6)
      .sign(new TextEncoder().encode(SECRET))

    await expect(
      verifyGuestConnectToken(expiredToken, "guest-conversation-1", SECRET),
    ).rejects.toThrow()
  })
})

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Bearer header", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi")
  })

  it("returns null for a missing header", () => {
    expect(extractBearerToken(null)).toBeNull()
  })

  it("returns null for a non-Bearer scheme", () => {
    expect(extractBearerToken("Basic abc")).toBeNull()
  })
})
