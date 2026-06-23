import { onError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { BatchHandlerPlugin } from "@orpc/server/plugins"
import { logger } from "@/lib/log"
import { router } from "@/routers"
import "../../../polyfill"

const rpcHandler = new RPCHandler(router, {
  interceptors: [
    // Log the real error before oRPC masks undefined errors as a generic 500.
    onError((error) => {
      logger.error(
        { err: error, cause: JSON.stringify((error as Error)?.cause) },
        "Error in RPC handler",
      )
    }),
  ],
  plugins: [new BatchHandlerPlugin()],
})

async function handleRequest(request: Request) {
  const { response } = await rpcHandler.handle(request, {
    prefix: "/rpc",
    context: { headers: request.headers, url: request.url },
  })

  return response ?? new Response("Not found", { status: 404 })
}

export const HEAD = handleRequest
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
