import type * as Party from "partykit/server"

export default class Server implements Party.Server {
  static onBeforeRequest() {
    return new Response("Access denied", { status: 403 })
  }

  static onBeforeConnect() {
    return new Response("Access denied", { status: 403 })
  }

  // Requests that don't match a `/parties/:party/:id` route (and so never
  // reach `onBeforeRequest`'s party-scoped guard above) — the only place
  // safe for an unauthenticated liveness probe.
  static onFetch(req: Party.Request): Response {
    if (new URL(req.url).pathname === "/health") {
      return new Response("ok", { status: 200 })
    }
    return new Response("Not found", { status: 404 })
  }

  onError(): void | Promise<void> {
    return
  }
}
