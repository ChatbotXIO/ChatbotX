import type * as Party from "partykit/server"
import { env } from "../env"
import { verifyBroadcastRequest } from "../lib/realtime-auth"

export default class GuestConversationParty implements Party.Server {
  // biome-ignore lint/style/noParameterProperties: wip
  constructor(readonly room: Party.Room) {}

  // onConnect(
  //   connection: Party.Connection,
  //   { request }: Party.ConnectionContext,
  // ) {
  // const userId = request.headers.get("X-GUEST-CONVERSATION-ID")
  // if (!userId) {
  //   return connection.close(1008, "Unauthorized")
  // }
  // }

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
