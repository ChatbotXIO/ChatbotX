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
    // `sort` is dropped, unlike the private table, and the order is pinned in
    // the handler instead — the same way the tags/bot-fields/broadcasts public
    // routes do it. A public list is paged by an integration that re-requests
    // page N later, so one order backed by a covering index is the whole
    // contract; there is no table header here to drive anything else.
    //
    // Note this is no longer what keeps a withheld column from being used as a
    // sort oracle — `SORTABLE_COLUMNS` (`@chatbotx.io/business/error-log-columns`) does that for both
    // routes, and `sourceId` is not selected on either. Re-exposing `sort` here
    // would be safe on that count and still wrong on paging stability.
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
          // Pinned here rather than left to the fallback order `listErrorLogs`
          // applies when no sort survives: paging stability on a route that
          // cannot pass `sort` is this route's contract, not something to
          // inherit from the query layer's default. Matches both that default
          // and the covering `ErrorLog_workspaceId_createdAt_idx`.
          sort: [{ id: "createdAt", desc: true }],
        }),
    ),
}
