import { listErrorLogs } from "@chatbotx.io/business/error-log"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { withPublicPaging } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  listErrorLogsRequest,
  publicListErrorLogsResponse,
} from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("analytics")

export const errorLogsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/error-logs",
      summary: "List error logs",
      tags: ["Error Logs"],
    })
    // `sort` is dropped, unlike the private table: `parseOrderByAsObject` gates
    // only on `sortItem.id in modelSchema`, so any real column is sortable —
    // including the `sourceId` that `publicListErrorLogsResponse` deliberately
    // strips. Ordering by a withheld column is an oracle over it (page through
    // an ascending sort and the PSIDs fall out lexicographically), which undoes
    // the allow-list. The order is pinned in the handler instead, the same way
    // the tags/bot-fields/broadcasts public routes do it.
    .input(
      withPublicPaging(
        listErrorLogsRequest.omit({ sort: true, workspaceId: true }),
      ),
    )
    .output(publicListErrorLogsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listErrorLogs({
          ...input,
          workspaceId: context.workspace.id,
          // Not just a safe default: `listErrorLogs` has no fallback order, so
          // without this the route would run with no ORDER BY at all and page
          // unstably. Matches both the table's own default and the covering
          // `ErrorLog_workspaceId_createdAt_idx`.
          sort: [{ id: "createdAt", desc: true }],
        }),
    ),
}
