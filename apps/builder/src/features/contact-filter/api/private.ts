import {
  listContactActivityValueOptions,
  resolveContactFilterValueLabels,
} from "@chatbotx.io/business"
import { contactActivityValueSources } from "@chatbotx.io/database/partials"
import { isContactActivityFiltersEnabled } from "@chatbotx.io/database/queries/contact-filter"
import { z } from "zod"
import {
  ACTIVITY_AVAILABILITY_PATH,
  ACTIVITY_VALUE_OPTIONS_PATH,
  FILTER_VALUE_LABELS_POST_PATH,
} from "@/features/contact-filter/lib/api-paths"
import {
  resolveFilterValueLabelsRequest,
  resolveFilterValueLabelsResponse,
} from "@/features/contact-filter/schema/value-labels"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const MAX_ACTIVITY_SEARCH_LENGTH = 100

export const privateContactFilterAPI = {
  listActivityValueOptionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: ACTIVITY_VALUE_OPTIONS_PATH,
      summary: "Search the values of an activity-backed contact filter",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        workspaceId: z.string(),
        source: z.enum(contactActivityValueSources),
        search: z.string().max(MAX_ACTIVITY_SEARCH_LENGTH).optional(),
      }),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(
      z.object({
        data: z.array(z.object({ value: z.string(), label: z.string() })),
      }),
    )
    .handler(async ({ input }) => ({
      data: await listContactActivityValueOptions(input),
    })),

  getActivityAvailabilityAPI: authorizedAPI
    .route({
      method: "GET",
      path: ACTIVITY_AVAILABILITY_PATH,
      summary: "Whether the activity-backed contact filters are available",
      tags: ["Contacts"],
    })
    .input(z.object({ workspaceId: z.string() }))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ enabled: z.boolean() }))
    .handler(() => ({ enabled: isContactActivityFiltersEnabled() })),

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
