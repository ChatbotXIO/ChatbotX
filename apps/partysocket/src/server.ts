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

// Health check endpoint
export async function onRequest(request: Request) {
  const url = new URL(request.url)

  if (url.pathname === "/health") {
    return new Response("OK", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    })
  }

  return new Response("Not Found", { status: 404 })
}
