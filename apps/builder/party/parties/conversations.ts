import type * as Party from "partykit/server"
import { getNextAuthSession } from "../utils/auth"

export default class ConversationParty implements Party.Server {
  constructor(readonly room: Party.Room) {}

  async onStart() {}

  async onConnect(
    connection: Party.Connection,
    { request }: Party.ConnectionContext,
  ) {
    const userId = request.headers.get("X-User-ID")
    this.room.broadcast(`Hello ${userId} from party!`)
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection) {}

  async onClose(connection: Party.Connection) {}

  async onError(connection: Party.Connection, error: Error) {}

  async onRequest(req: Party.Request) {
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
