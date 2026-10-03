import {
  aiHandoverBulkRunService,
  aiHandoverSettingsService,
} from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { toApplyToAllStatus, toBulkRunResource } from "../lib/bulk-run-resource"
import {
  getApplyToAllStatusRequest,
  getApplyToAllStatusResponse,
  listAiHandoverBulkHistoryRequest,
  listAiHandoverBulkHistoryResponse,
} from "../schema/bulk"

export const aiHandoverAPIs = {
  getApplyToAllStatus: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/inboxes/{inboxId}/ai-handover/apply-to-all",
      summary: "Get a Page's Meta Business AI apply-to-all state and its run",
      tags: ["Integrations"],
    })
    .input(getApplyToAllStatusRequest)
    .output(getApplyToAllStatusResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const [state, activeSettings] = await Promise.all([
        aiHandoverBulkRunService.findStatus(input),
        aiHandoverSettingsService.findActive(input),
      ])
      return toApplyToAllStatus(state, activeSettings !== null)
    }),

  listBulkHistory: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/inboxes/{inboxId}/ai-handover/history",
      summary: "List a Page's Meta Business AI apply-to-all runs, newest first",
      tags: ["Integrations"],
    })
    .input(listAiHandoverBulkHistoryRequest)
    .output(listAiHandoverBulkHistoryResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { data, pageCount } = await aiHandoverBulkRunService.listHistory({
        workspaceId: input.workspaceId,
        inboxId: input.inboxId,
        page: input.page ?? undefined,
        perPage: input.perPage ?? undefined,
      })
      return {
        data: data.map((run) => toBulkRunResource(run, run.requestedBy)),
        pageCount,
      }
    }),
}
