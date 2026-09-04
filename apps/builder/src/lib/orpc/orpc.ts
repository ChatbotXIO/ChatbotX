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

// These procedures carry a per-call AbortSignal for a user-triggered timeout/abort.
// BatchLinkPlugin merges item signals and only aborts once every item in the batch
// aborts (@orpc/standard-server toBatchAbortSignal), which would silently drop a
// per-call timeout. Each is a single action where batching gains nothing, so they
// are excluded and sent unbatched instead.
const UNBATCHED = new Set([
  "conversationsAPI.listConversationsByPOSTAuthenticatedAPI",
  "aiMcpServerAPIs.validateAIMcpServerAuthenticatedAPI",
  "whatsappMessageTemplateAPIs.listWhatsappMessageTemplatesInternalAPI",
])

const link = new RPCLink({
  url: `${typeof window === "undefined" ? "http://localhost:3123" : window.location.origin}/rpc`,
  plugins: [
    new BatchLinkPlugin({
      exclude: ({ path }) => path[0] === "sse" || UNBATCHED.has(path.join(".")),
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
