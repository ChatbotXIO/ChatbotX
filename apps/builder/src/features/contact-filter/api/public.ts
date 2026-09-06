import { listContactFilterFieldsForAPI } from "@/features/contact-filter/queries/list-contact-filter-fields"
import { listContactFilterFieldsPublicResponse } from "@/features/contact-filter/schema/public"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsFilterFieldsPublicRouter = {
  listFilterFields: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/filter-fields",
      summary: "List every field usable in a contact filter",
      description:
        "Returns the static fields available for `contactFilter` conditions (with each field's supported operators), plus the workspace's actual custom fields, bot fields, and tags so a filter condition can reference a real id/name instead of guessing one. Use this before building a `contactFilter` for `contacts.search` or `contacts.count`.",
      tags: ["Contacts"],
    })
    .output(listContactFilterFieldsPublicResponse)
    .handler(
      async ({ context }) =>
        await listContactFilterFieldsForAPI({
          workspaceId: context.workspace.id,
        }),
    ),
}
