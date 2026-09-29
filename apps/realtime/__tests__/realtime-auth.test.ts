import {
  REALTIME_TOKEN_PURPOSE,
  signRealtimeToken,
} from "@chatbotx.io/partysocket-config/auth"
import { SignJWT } from "jose"
import type * as Party from "partykit/server"
import { describe, expect, it } from "vitest"
import { verifyBroadcastRequest } from "../src/lib/realtime-auth"

const SECRET = "s".repeat(32)

const asRequest = (req: Request): Party.Request =>
  req as unknown as Party.Request

const signPurposeLessToken = async (audience: string): Promise<string> =>
  await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(audience)
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(SECRET))

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

  it("rejects a purpose-less token", async () => {
    const token = await signPurposeLessToken("workspace:ws_1")
    const req = asRequest(
      new Request("https://realtime.example.com/parties/workspaces/ws_1", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )

    const result = await verifyBroadcastRequest(req, "workspace", SECRET)

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it("rejects a token carrying the wrong purpose", async () => {
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
