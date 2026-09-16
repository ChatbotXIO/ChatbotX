import { describe, expect, it } from "vitest"
import {
  extractBearerToken,
  signMemberConnectToken,
  signRealtimeToken,
  verifyMemberConnectToken,
  verifyRealtimeToken,
} from "../src/auth"

const SECRET = "a".repeat(32)
const OTHER_SECRET = "b".repeat(32)

describe("signRealtimeToken / verifyRealtimeToken", () => {
  it("verifies a token signed for the same audience", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      SECRET,
    )

    await expect(
      verifyRealtimeToken(token, { kind: "workspace", id: "ws_1" }, SECRET),
    ).resolves.toBeDefined()
  })

  it("rejects when the audience id does not match (room-claim mismatch)", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      SECRET,
    )

    await expect(
      verifyRealtimeToken(token, { kind: "workspace", id: "ws_2" }, SECRET),
    ).rejects.toThrow()
  })

  it("rejects when signed with a different secret", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      SECRET,
    )

    await expect(
      verifyRealtimeToken(
        token,
        { kind: "workspace", id: "ws_1" },
        OTHER_SECRET,
      ),
    ).rejects.toThrow()
  })

  it("carries extra claims through the payload", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      SECRET,
      { userId: "u_1" },
    )

    const payload = await verifyRealtimeToken(
      token,
      { kind: "workspace", id: "ws_1" },
      SECRET,
    )

    expect(payload.userId).toBe("u_1")
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
