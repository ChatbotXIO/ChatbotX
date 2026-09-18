import { afterEach, describe, expect, it, vi } from "vitest"
import {
  extractBearerToken,
  LEGACY_PURPOSE_WINDOW_CUTOFF,
  REALTIME_TOKEN_PURPOSE,
  signMemberConnectToken,
  signRealtimeToken,
  verifyMemberConnectToken,
  verifyRealtimeToken,
} from "../src/auth"

const SECRET = "a".repeat(32)
const OTHER_SECRET = "b".repeat(32)

describe("signRealtimeToken / verifyRealtimeToken", () => {
  it("verifies a token signed for the same audience and purpose", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.broadcast,
      SECRET,
    )

    await expect(
      verifyRealtimeToken(
        token,
        { kind: "workspace", id: "ws_1" },
        REALTIME_TOKEN_PURPOSE.broadcast,
        SECRET,
      ),
    ).resolves.toBeDefined()
  })

  it("rejects when the audience id does not match (room-claim mismatch)", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.broadcast,
      SECRET,
    )

    await expect(
      verifyRealtimeToken(
        token,
        { kind: "workspace", id: "ws_2" },
        REALTIME_TOKEN_PURPOSE.broadcast,
        SECRET,
      ),
    ).rejects.toThrow()
  })

  it("rejects when signed with a different secret", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.broadcast,
      SECRET,
    )

    await expect(
      verifyRealtimeToken(
        token,
        { kind: "workspace", id: "ws_1" },
        REALTIME_TOKEN_PURPOSE.broadcast,
        OTHER_SECRET,
      ),
    ).rejects.toThrow()
  })

  it("carries extra claims through the payload", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.broadcast,
      SECRET,
      { userId: "u_1" },
    )

    const payload = await verifyRealtimeToken(
      token,
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.broadcast,
      SECRET,
    )

    expect(payload.userId).toBe("u_1")
  })

  it("embeds the purpose claim in the signed payload (undecoded)", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.presenceReport,
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

  it("rejects a token minted for a different purpose — a broadcast token must not verify as a presence-report token (MEDIUM-3)", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.broadcast,
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

  it("rejects a purpose-less token by default (no legacy window unless explicitly requested) — BLOCKER-a", async () => {
    const { SignJWT } = await import("jose")
    const legacyToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setAudience("workspace:ws_1")
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(SECRET))

    await expect(
      verifyRealtimeToken(
        legacyToken,
        { kind: "workspace", id: "ws_1" },
        REALTIME_TOKEN_PURPOSE.broadcast,
        SECRET,
      ),
    ).rejects.toThrow()
  })

  it("accepts a purpose-less legacy token when allowLegacyMissingPurpose is set — rolling-deploy compat window (BLOCKER-a)", async () => {
    const { SignJWT } = await import("jose")
    const legacyToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setAudience("workspace:ws_1")
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(SECRET))

    await expect(
      verifyRealtimeToken(
        legacyToken,
        { kind: "workspace", id: "ws_1" },
        REALTIME_TOKEN_PURPOSE.broadcast,
        SECRET,
        { allowLegacyMissingPurpose: true },
      ),
    ).resolves.toBeDefined()
  })

  it("still rejects a PRESENT-but-wrong purpose even with allowLegacyMissingPurpose set (BLOCKER-a)", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.presenceReport,
      SECRET,
    )

    await expect(
      verifyRealtimeToken(
        token,
        { kind: "workspace", id: "ws_1" },
        REALTIME_TOKEN_PURPOSE.broadcast,
        SECRET,
        { allowLegacyMissingPurpose: true },
      ),
    ).rejects.toThrow()
  })
})

describe("signMemberConnectToken / verifyMemberConnectToken", () => {
  it("verifies a token minted for the same workspace room", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1" },
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_1", SECRET),
    ).resolves.toEqual({ userId: "u_1" })
  })

  it("rejects a cross-room replay — token minted for a different workspace", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1" },
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_2", SECRET),
    ).rejects.toThrow()
  })

  it("rejects a token missing the userId claim", async () => {
    // Minted via the lower-level primitive with no claims, simulating a
    // token that never carried `userId` — must never be silently trusted.
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.memberConnect,
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_1", SECRET),
    ).rejects.toThrow()
  })

  it("rejects a token signed with a different secret", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1" },
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_1", OTHER_SECRET),
    ).rejects.toThrow()
  })

  it("rejects a purpose-less token — member-connect never had a legacy window (round-2 tightening: no pre-existing purpose-less token of this kind can exist, and a shared exception with broadcast would let it impersonate a broadcast-authorized request)", async () => {
    const { SignJWT } = await import("jose")
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

  it("a freshly minted member-connect token must never verify as a broadcast request — no cross-purpose confusion even though both share the workspace:<id> audience shape", async () => {
    const token = await signMemberConnectToken(
      { workspaceId: "ws_1", userId: "u_1" },
      SECRET,
    )

    await expect(
      verifyRealtimeToken(
        token,
        { kind: "workspace", id: "ws_1" },
        REALTIME_TOKEN_PURPOSE.broadcast,
        SECRET,
        { allowLegacyMissingPurpose: true },
      ),
    ).rejects.toThrow()
  })

  it("a freshly minted broadcast token must never verify as a member-connect token — same cross-purpose confusion, reversed", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.broadcast,
      SECRET,
    )

    await expect(
      verifyMemberConnectToken(token, "ws_1", SECRET),
    ).rejects.toThrow()
  })
})

describe("legacy purpose window is self-closing (round-2 tightening)", () => {
  const legacyToken = async (audience: string) => {
    const { SignJWT } = await import("jose")
    return await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setAudience(audience)
      .setExpirationTime("60s")
      .sign(new TextEncoder().encode(SECRET))
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it("still accepts a purpose-less token just before the cutoff", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(LEGACY_PURPOSE_WINDOW_CUTOFF.getTime() - 1000))
    const token = await legacyToken("workspace:ws_1")

    await expect(
      verifyRealtimeToken(
        token,
        { kind: "workspace", id: "ws_1" },
        REALTIME_TOKEN_PURPOSE.broadcast,
        SECRET,
        { allowLegacyMissingPurpose: true },
      ),
    ).resolves.toBeDefined()
  })

  it("rejects a purpose-less token once wall time reaches the cutoff, even with allowLegacyMissingPurpose set", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(LEGACY_PURPOSE_WINDOW_CUTOFF.getTime()))
    const token = await legacyToken("workspace:ws_1")

    await expect(
      verifyRealtimeToken(
        token,
        { kind: "workspace", id: "ws_1" },
        REALTIME_TOKEN_PURPOSE.broadcast,
        SECRET,
        { allowLegacyMissingPurpose: true },
      ),
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
