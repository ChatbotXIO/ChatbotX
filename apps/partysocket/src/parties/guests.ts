import type * as Party from "partykit/server"

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

  static onBeforeRequest(
    req: Party.Request,
    lobby: Party.Lobby,
    // ctx: Party.ExecutionContext
  ) {
    if (req.headers.get("X-API-KEY") !== lobby.env.PARTYSOCKET_API_KEY) {
      return new Response("Method not allowed", { status: 405 })
    }
    return req
  }

  // static async onBeforeConnect(
  //   req: Party.Request,
  // lobby: Party.Lobby,
  // ctx: Party.ExecutionContext
  // ) {
  // const session = await getAuthSession(req)
  // req.headers.set("X-GUEST-CONVERSATION-ID", session.user.id)

  // return req
  // }
}
