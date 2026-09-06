import { contactService, importService } from "@chatbotx.io/business"
import { contactSources, genderTypes } from "@chatbotx.io/database/partials"
import { contactRepository } from "@chatbotx.io/database/repositories"
import { z } from "zod"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  countContactsForAPI,
  listContactsForAPI,
} from "../../queries/list-contacts.queries"
import {
  createContactRequest,
  updateContactFieldRequest,
} from "../../schema/action"
import {
  buildContactImportMeta,
  importContactsRequest,
} from "../../schema/contact-import"
import {
  countContactsPublicRequest,
  countContactsPublicResponse,
  importContactsPublicResponse,
  listContactsPublicRequest,
} from "../../schema/public/crud"
import {
  contactResponse,
  listContactsResponse,
  publicListContactsByCustomFieldRequest,
  publicListContactsResponse,
} from "../../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsCrudPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts",
      summary: "List contacts",
      description:
        "List contacts in the workspace, with optional keyword search and filter. Supports `include` to shrink the response (e.g. `include=tags`) and `withCount=false` to skip the total-count query when you only need the rows.",
      tags: ["Contacts"],
    })
    .input(listContactsPublicRequest)
    .output(listContactsResponse)
    .handler(async ({ context, input }) => {
      const { include, withCount, ...rest } = input
      return await listContactsForAPI(
        { ...rest, workspaceId: context.workspace.id },
        { include, withCount },
      )
    }),

  search: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/search",
      summary: "Search contacts with a filter body",
      description:
        "Same as `GET /v1/contacts` but accepts the filter as a JSON request body instead of query parameters — use this when `contactFilter` is large or deeply nested. Supports the same `include`/`withCount` options.",
      tags: ["Contacts"],
    })
    .input(listContactsPublicRequest)
    .output(listContactsResponse)
    .handler(async ({ context, input }) => {
      const { include, withCount, ...rest } = input
      return await listContactsForAPI(
        { ...rest, workspaceId: context.workspace.id },
        { include, withCount },
      )
    }),

  count: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/count",
      summary: "Count contacts matching a filter",
      tags: ["Contacts"],
    })
    .input(countContactsPublicRequest)
    .output(countContactsPublicResponse)
    .handler(
      async ({ context, input }) =>
        await countContactsForAPI({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}",
      summary:
        "Get contact by identifier (id:123, email:user@example.com, phone:+84...)",
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(contactResponse)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      return await contactService.findPublicContactOrFail({
        id: contactId,
        workspaceId: context.workspace.id,
      })
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts",
      summary: "Create a contact",
      tags: ["Contacts"],
    })
    .input(createContactRequest)
    .output(contactResponse)
    .handler(async ({ context, input }) => {
      const { contact } = await contactService.createWithInbox({
        workspaceId: context.workspace.id,
        input,
      })
      return await contactService.findPublicContactOrFail({
        id: contact.id,
        workspaceId: context.workspace.id,
      })
    }),

  findByCustomField: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/find-by-custom-field",
      summary: "List contacts by custom field",
      description:
        "Find contacts by custom field value. It will return maximum 100 contacts. The results are sorted by the last custom field value update for a contact.",
      tags: ["Contacts"],
    })
    .input(publicListContactsByCustomFieldRequest)
    .output(publicListContactsResponse)
    .handler(
      async ({ context, input }) =>
        await contactRepository.listPublicByCustomField({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  import: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/import",
      summary: "Import contacts from a file",
      successStatus: 201,
      tags: ["Contacts"],
    })
    .input(importContactsRequest)
    .output(importContactsPublicResponse)
    .handler(
      async ({ context, input }) =>
        await importService.startContactImport({
          workspaceId: context.workspace.id,
          userId: null,
          inboxId: input.inboxId,
          fileId: input.fileId,
          meta: buildContactImportMeta(input),
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}",
      summary: "Update contact fields",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z
        .object({ identifier: z.string().min(1) })
        .and(updateContactFieldRequest),
    )
    .handler(async ({ context, input }) => {
      const { identifier, ...fields } = input
      const contactId = await contactService.resolveIdByIdentifier({
        identifier,
        workspaceId: context.workspace.id,
      })
      await contactService.updateFieldsAndCustomFields(
        { workspaceId: context.workspace.id, id: contactId },
        fields,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}",
      summary: "Delete a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactService.deleteAndRecord({
        triggerSource: "api",
        workspaceId: context.workspace.id,
        ids: [contactId],
      })
    }),

  block: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/block",
      summary: "Block a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactService.blockAndRecord({
        workspaceId: context.workspace.id,
        id: contactId,
      })
    }),

  unblock: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/unblock",
      summary: "Unblock a contact",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactService.unblockAndRecord({
        workspaceId: context.workspace.id,
        id: contactId,
      })
    }),

  upsert: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/upsert",
      summary: "Upsert a contact by identifier",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        firstName: z.string().trim().max(100).optional(),
        lastName: z.string().trim().max(100).optional(),
        email: z.union([z.literal(""), z.email().max(100)]).optional(),
        phoneNumber: z
          .string()
          .min(10)
          .max(20)
          .regex(/\+?\d{10,20}/)
          .optional(),
        avatar: z.string().optional(),
        gender: genderTypes.optional(),
      }),
    )
    .output(contactResponse)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const { identifier, avatar, ...fields } = input

      const { contact } = await contactService.upsertByIdentifier({
        workspaceId,
        identifier,
        avatar,
        source: contactSources.enum.api,
        data: {
          ...(fields.firstName !== undefined && {
            firstName: fields.firstName,
          }),
          ...(fields.lastName !== undefined && { lastName: fields.lastName }),
          ...(fields.email !== undefined && { email: fields.email }),
          ...(fields.phoneNumber !== undefined && {
            phoneNumber: fields.phoneNumber,
          }),
          ...(fields.gender !== undefined && { gender: fields.gender }),
        },
      })

      return await contactService.findPublicContactOrFail({
        id: contact.id,
        workspaceId,
      })
    }),
}
