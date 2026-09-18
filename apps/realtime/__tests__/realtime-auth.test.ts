import {
  REALTIME_TOKEN_PURPOSE,
  signRealtimeToken,
} from "@chatbotx.io/partysocket-config/auth"
import type * as Party from "partykit/server"
import { describe, expect, it } from "vitest"
import { verifyBroadcastRequest } from "../src/lib/realtime-auth"

const SECRET = "s".repeat(32)

const asRequest = (req: Request): Party.Request =>
  req as unknown as Party.Request

const signLegacyTokenWithNoPurposeClaim = async (
  audience: string,
): Promise<string> => {
  const { SignJWT } = await import("jose")
  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(audience)
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(SECRET))
}

describe("verifyBroadcastRequest", () => {
  it("accepts a token minted with the broadcast purpose", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.broadcast,
      SECRET,
    )
    const req = asRequest(
      new Request("https://realtime.example.com/parties/workspaces/ws_1", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )

    const result = await verifyBroadcastRequest(req, "workspace", SECRET)

    expect(result).toBeNull()
  })

  it("accepts a purpose-less legacy token — rolling-deploy compat window (BLOCKER-a)", async () => {
    const token = await signLegacyTokenWithNoPurposeClaim("workspace:ws_1")
    const req = asRequest(
      new Request("https://realtime.example.com/parties/workspaces/ws_1", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )

    const result = await verifyBroadcastRequest(req, "workspace", SECRET)

    expect(result).toBeNull()
  })

  it("still rejects a token carrying the WRONG purpose, even during the legacy window", async () => {
    const token = await signRealtimeToken(
      { kind: "workspace", id: "ws_1" },
      REALTIME_TOKEN_PURPOSE.presenceReport,
      SECRET,
    )
    const req = asRequest(
      new Request("https://realtime.example.com/parties/workspaces/ws_1", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )

    const result = await verifyBroadcastRequest(req, "workspace", SECRET)

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it("rejects when no bearer token is present", async () => {
    const req = asRequest(
      new Request("https://realtime.example.com/parties/workspaces/ws_1"),
    )

    const result = await verifyBroadcastRequest(req, "workspace", SECRET)

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })
})
