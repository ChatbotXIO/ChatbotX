import type * as Party from "partykit/server"

export default class Server implements Party.Server {
  static onBeforeRequest() {
    return new Response("Access denied", { status: 403 })
  }

  static onBeforeConnect() {
    return new Response("Access denied", { status: 403 })
  }

  onError(): void | Promise<void> {
    return
  }
}
