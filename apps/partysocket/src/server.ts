import type * as Party from "partykit/server"

export default class Server implements Party.Server {
  onStart() {}

  static async onBeforeRequest() {
    return new Response("Access denied", { status: 403 })
  }

  static async onBeforeConnect() {
    return new Response("Access denied", { status: 403 })
  }
}
