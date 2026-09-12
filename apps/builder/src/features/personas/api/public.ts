import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listMessengerPersonaOptions } from "../lib/persona-options"
import { listMessengerPersonasResponse } from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("channels")

export const messengerPersonasPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/messenger-personas",
      summary: "List Messenger personas across the workspace's pages",
      tags: ["Channels"],
    })
    .output(listMessengerPersonasResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) =>
        await listMessengerPersonaOptions({
          workspaceId: context.workspace.id,
        }),
    ),
}
