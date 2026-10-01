import { resolveContactFilterValueLabels } from "@chatbotx.io/business"
import { FILTER_VALUE_LABELS_POST_PATH } from "@/features/contact-filter/lib/api-paths"
import {
  resolveFilterValueLabelsRequest,
  resolveFilterValueLabelsResponse,
} from "@/features/contact-filter/schema/value-labels"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

export const privateContactFilterAPI = {
  // POST only because the id lists don't fit a query string; it is a pure read
  // (see `READ_ONLY_POST_PATHS`), so it stays open for trial-expired workspaces.
  resolveFilterValueLabelsAPI: authorizedAPI
    .route({
      method: "POST",
      path: FILTER_VALUE_LABELS_POST_PATH,
      summary: "Resolve the names of the ids a contact filter references",
      tags: ["Contacts"],
    })
    .input(resolveFilterValueLabelsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(resolveFilterValueLabelsResponse)
    .handler(
      async ({ input: { workspaceId, ...ids } }) =>
        await resolveContactFilterValueLabels({ workspaceId, ids }),
    ),
}
