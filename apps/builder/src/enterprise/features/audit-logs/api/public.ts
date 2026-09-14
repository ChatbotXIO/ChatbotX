import { assertEnterpriseFeatures } from "@chatbotx.io/business"
import { listAuditLogs } from "@chatbotx.io/business/audit"
import { possibleErrorsOnListingEnterpriseResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  listAuditLogsPublicRequest,
  listAuditLogsPublicResponse,
} from "../schema/public"
import { parseAuditLogsDateRange } from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("workspace")

const tags = ["Audit Logs"]

export const auditLogsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/audit-logs",
      summary: "List audit logs",
      tags,
    })
    .input(listAuditLogsPublicRequest)
    .output(listAuditLogsPublicResponse)
    .errors(possibleErrorsOnListingEnterpriseResource)
    .handler(async ({ context, input }) => {
      await assertEnterpriseFeatures()

      const dateRange = parseAuditLogsDateRange(input)

      return await listAuditLogs({
        workspaceId: context.workspace.id,
        page: input.page,
        perPage: input.perPage,
        sort: input.sort,
        keyword: input.keyword,
        userId: input.userId,
        dateRange: {
          start: dateRange.start,
          end: dateRange.end,
        },
      })
    }),
}
