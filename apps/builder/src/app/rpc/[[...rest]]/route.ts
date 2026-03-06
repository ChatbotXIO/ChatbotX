import { onError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { BatchHandlerPlugin } from "@orpc/server/plugins"
import { router } from "@/routers"
import "../../../polyfill"

const rpcHandler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
  plugins: [new BatchHandlerPlugin()],
})

async function handleRequest(request: Request) {
  const { response } = await rpcHandler.handle(request, {
    prefix: "/rpc",
    context: { headers: request.headers },
  })

  return response ?? new Response("Not found", { status: 404 })
}

export const HEAD = handleRequest
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
