import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { BatchLinkPlugin } from "@orpc/client/plugins"
import type { InferRouterInputs, RouterClient } from "@orpc/server"
import type { router } from "@/routers"

type RouterInputs = InferRouterInputs<typeof router>

/** `"<router key>.<procedure key>"` for every procedure on the full router. */
export type ProcedurePath = {
  [K in keyof RouterInputs & string]: `${K}.${keyof RouterInputs[K] & string}`
}[keyof RouterInputs & string]

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
// are excluded and sent unbatched instead. Typed against the router so a
// renamed procedure fails to compile here instead of silently re-batching.
export const UNBATCHED_PROCEDURE_PATHS: ReadonlySet<ProcedurePath> =
  new Set<ProcedurePath>([
    "conversationsAPI.listConversationsByPOSTAuthenticatedAPI",
    "aiMcpServerAPIs.validateAIMcpServerAuthenticatedAPI",
    "whatsappMessageTemplateAPIs.listWhatsappMessageTemplatesInternalAPI",
  ])

/**
 * `BatchLinkPlugin`'s `exclude` predicate: true for every SSE procedure (SSE
 * cannot be batched) and every `UNBATCHED_PROCEDURE_PATHS` entry above, false
 * for everything else. Exported so its branching can be unit-tested without
 * standing up the real `RPCLink`.
 */
export function isUnbatchedProcedure({ path }: { path: readonly string[] }) {
  return (
    path[0] === "sse" ||
    UNBATCHED_PROCEDURE_PATHS.has(path.join(".") as ProcedurePath)
  )
}

const link = new RPCLink({
  url: `${typeof window === "undefined" ? "http://localhost:3123" : window.location.origin}/rpc`,
  plugins: [
    new BatchLinkPlugin({
      exclude: isUnbatchedProcedure,
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
