import { verifyGuestConnectToken } from "@chatbotx.io/partysocket-config"
import type * as Party from "partykit/server"
import { env } from "../env"
import { verifyBroadcastRequest } from "../lib/realtime-auth"

export default class GuestConversationParty implements Party.Server {
  // biome-ignore lint/style/noParameterProperties: wip
  constructor(readonly room: Party.Room) {}

  static async onBeforeConnect(req: Party.Request, lobby: Party.Lobby) {
    const token = new URL(req.url).searchParams.get("token")
    if (!token) {
      return new Response("Unauthorized", { status: 401 })
    }

    try {
      await verifyGuestConnectToken(
        token,
        lobby.id,
        env.REALTIME_BROADCAST_SECRET,
      )
    } catch {
      return new Response("Unauthorized", { status: 401 })
    }

    return req
  }

  async onRequest(req: Party.Request) {
    const payload = await req.json()
    this.room.broadcast(JSON.stringify(payload))

    return new Response("ok", { status: 200 })
  }

  static async onBeforeRequest(
    req: Party.Request,
    // lobby: Party.Lobby,
    // ctx: Party.ExecutionContext
  ) {
    const error = await verifyBroadcastRequest(
      req,
      "guest",
      env.REALTIME_BROADCAST_SECRET as string,
    )
    return error ?? req
  }
}
