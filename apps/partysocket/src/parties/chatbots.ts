import type * as Party from "partykit/server"
import { getNextAuthSession } from "../utils/auth"

export default class ChatbotParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onConnect(
    connection: Party.Connection,
    { request }: Party.ConnectionContext,
  ) {
    const userId = request.headers.get("X-User-ID")
    if (!userId) return connection.close(1008, "Unauthorized")
  }

  async onRequest(req: Party.Request) {
    const payload = await req.json()
    this.room.broadcast(JSON.stringify(payload))

    return new Response("ok", { status: 200 })
  }

  async onAlarm() {}

  static async onBeforeRequest(
    req: Party.Request,
    lobby: Party.Lobby,
    // ctx: Party.ExecutionContext
  ) {
    if (req.headers.get("X-API-KEY") !== lobby.env.PARTYSOCKET_API_KEY) {
      return new Response("Method not allowed", { status: 405 })
    }
    return req
  }

  static async onBeforeConnect(
    req: Party.Request,
    // lobby: Party.Lobby,
    // ctx: Party.ExecutionContext
  ) {
    const session = await getNextAuthSession(req)
    req.headers.set("X-User-ID", session.user.id)

    return req
  }
}
