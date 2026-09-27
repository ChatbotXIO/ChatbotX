import {
  REALTIME_TOKEN_PURPOSE,
  signGuestConnectToken,
} from "@chatbotx.io/partysocket-config"
import { SignJWT } from "jose"
import type * as Party from "partykit/server"
import { describe, expect, it, vi } from "vitest"

const { SECRET } = vi.hoisted(() => ({ SECRET: "s".repeat(32) }))

vi.mock("../src/env", () => ({
  env: { REALTIME_BROADCAST_SECRET: SECRET },
}))

import GuestConversationParty from "../src/parties/guests"

const asRequest = (url: string): Party.Request =>
  new Request(url) as unknown as Party.Request
const asLobby = (id: string): Party.Lobby => ({ id }) as unknown as Party.Lobby

describe("GuestConversationParty.onBeforeConnect", () => {
  it("rejects a missing guest token", async () => {
    const result = await GuestConversationParty.onBeforeConnect(
      asRequest("https://realtime.example.com/parties/guests/guest-1"),
      asLobby("guest-1"),
    )

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it("rejects a guest token replayed for another room", async () => {
    const token = await signGuestConnectToken(
      { guestConversationId: "guest-1" },
      SECRET,
    )
    const result = await GuestConversationParty.onBeforeConnect(
      asRequest(
        `https://realtime.example.com/parties/guests/guest-2?token=${token}`,
      ),
      asLobby("guest-2"),
    )

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  it("rejects an expired guest token", async () => {
    const token = await new SignJWT({
      guestConversationId: "guest-1",
      purpose: REALTIME_TOKEN_PURPOSE.guestConnect,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("guest:guest-1")
      .setExpirationTime("-10s")
      .sign(new TextEncoder().encode(SECRET))
    const result = await GuestConversationParty.onBeforeConnect(
      asRequest(
        `https://realtime.example.com/parties/guests/guest-1?token=${token}`,
      ),
      asLobby("guest-1"),
    )

    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })
})
