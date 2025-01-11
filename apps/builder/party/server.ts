import type * as Party from "partykit/server"

export default class Server implements Party.Server {
  onStart() {}

  static async onBeforeRequest(
    req: Party.Request,
    lobby: Party.Lobby,
    ctx: Party.ExecutionContext,
  ) {
    return new Response("Access denied", { status: 403 })
  }

  static async onBeforeConnect(
    req: Party.Request,
    lobby: Party.Lobby,
    ctx: Party.ExecutionContext,
  ) {
    return new Response("Access denied", { status: 403 })
  }
}
