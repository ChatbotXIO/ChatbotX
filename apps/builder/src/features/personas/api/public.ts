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
      description:
        "Returns available Messenger personas from every connected page, used to set which persona a message is sent as.",
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
