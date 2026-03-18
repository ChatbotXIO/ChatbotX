import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { BatchLinkPlugin } from "@orpc/client/plugins"
import type { RouterClient } from "@orpc/server"
import type { router } from "@/routers"

/**
 * This is part of the Optimize SSR setup.
 *
 * @see {@link https://orpc.dev/docs/adapters/next#optimize-ssr}
 */
declare global {
  var $client: RouterClient<typeof router> | undefined
}

const link = new RPCLink({
  url: `${typeof window === "undefined" ? "http://localhost:3000" : window.location.origin}/rpc`,
  plugins: [
    new BatchLinkPlugin({
      exclude: ({ path }) => path[0] === "sse",
      groups: [
        {
          condition: () => true,
          context: {},
        },
      ],
    }),
  ],
})

export const client: RouterClient<typeof router> =
  globalThis.$client ?? createORPCClient(link)
