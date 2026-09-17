import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listInboxes } from "../queries"
import {
  publicListInboxResponse,
  publishInboxesRequest,
} from "../schema/action"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

export const inboxesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inboxes",
      summary: "List inboxes",
      description:
        "List connected inboxes with their internal IDs. Use `id` as the `inboxId` parameter when sending messages or flows to a contact.",
      tags: ["Channels"],
    })
    .input(publishInboxesRequest)
    .output(publicListInboxResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listInboxes({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),
}
