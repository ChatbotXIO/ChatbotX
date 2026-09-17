import { listContactFilterFieldsForAPI } from "@/features/contact-filter/lib/list-contact-filter-fields"
import { listContactFilterFieldsPublicResponse } from "@/features/contact-filter/schema/public"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsFilterFieldsPublicRouter = {
  listFilterFields: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/filter-fields",
      summary: "List contact filter fields",
      description:
        "Returns the static fields available for `contactFilter` conditions (with each field's supported operators), plus the workspace's actual custom fields, bot fields, and tags so a filter condition can reference a real id/name instead of guessing one. Each custom/bot field also carries `valueType`, the value to copy into a `customField`/`botField` condition's `valueType`. Use this before building a `contactFilter` for `contacts.list` or `contacts.count` — including to look up a contact by email or phone number, which are the `email`/`phone` static fields here, not a `customField` condition.",
      tags: ["Contacts"],
    })
    .output(listContactFilterFieldsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context }) =>
        await listContactFilterFieldsForAPI({
          workspaceId: context.workspace.id,
        }),
    ),
}
