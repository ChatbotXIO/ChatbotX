import { contactService, importService, UNSCOPED } from "@chatbotx.io/business"
import { getAuditActor } from "@chatbotx.io/business/audit"
import { contactSources, genderTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnCreatingContact,
  possibleErrorsOnCreatingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
  possibleErrorsOnStartingContactImport,
  possibleErrorsOnUpsertingContact,
  possibleErrorsOnWritingContactFields,
} from "@/lib/orpc/orpc-error-helper"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { resolveContactAvatars } from "../../queries/resolve-contact-avatars"
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

const pickAuditRequestInfo = (
  actor: ReturnType<typeof getAuditActor>,
): { ipAddress?: string; userAgent?: string } => ({
  ipAddress: actor?.ipAddress,
  userAgent: actor?.userAgent,
})

export const contactsCrudPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts",
      summary: "List contacts",
      description:
        "Use this to find contacts by name, keyword, or filter before inspecting one with `contacts.get` or sending a message with `contacts.sendMessage`. Supports `include` and `withCount` to shape the response. Call `contacts.listFilterFields` first to discover `contactFilter` fields, including custom fields.",
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(listContactsPublicRequest)
    .output(listContactsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { include, withCount, ...rest } = input
      const result = await contactService.list({
        ...rest,
        workspaceId: context.workspace.id,
        scope: UNSCOPED,
        include,
        withCount,
      })
      // Same avatar resolution as the builder list: a stored key or no-avatar
      // sentinel becomes a usable URL.
      return {
        ...result,
        data: await resolveContactAvatars(result.data, context.workspace.id, {
          publicUrls: true,
        }),
      }
    }),

  // Deprecated — use `contacts.list` instead (same filter shape, as a
  // query-string request). Kept for backward compatibility with the
  // pre-consolidation `/search` path; hidden from MCP/CLI tool listings.
  search: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/search",
      summary: "Search contacts with filter body",
      description:
        "Deprecated — `contacts.list` accepts the identical `contactFilter` shape as a query-string request; this POST-with-body variant is kept only for callers that have not migrated.",
      tags: ["Contacts"],
      deprecated: true,
    })
    .input(listContactsPublicRequest)
    .output(listContactsResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { include, withCount, ...rest } = input
      const result = await contactService.list({
        ...rest,
        workspaceId: context.workspace.id,
        scope: UNSCOPED,
        include,
        withCount,
      })
      // Same avatar resolution as the builder list: a stored key or no-avatar
      // sentinel becomes a usable URL.
      return {
        ...result,
        data: await resolveContactAvatars(result.data, context.workspace.id, {
          publicUrls: true,
        }),
      }
    }),

  count: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/count",
      summary: "Count contacts matching filter",
      description:
        "Counts contacts matching the same filter shape as `contacts.list`, without paginating the rows.",
      tags: ["Contacts"],
    })
    .input(countContactsPublicRequest)
    .output(countContactsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await contactService.count({
          ...input,
          workspaceId: context.workspace.id,
          scope: UNSCOPED,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}",
      summary: "Get contact",
      description:
        "Use this to look up a contact by email, phone, or id after locating a prefixed identifier. Call `contacts.list` to search first, or use `contacts.sendMessage` to contact the result.",
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
      }),
    )
    .output(contactResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      const contact = await contactService.findPublicContactOrFail({
        id: contactId,
        workspaceId: context.workspace.id,
      })
      const [resolved] = await resolveContactAvatars(
        [contact],
        context.workspace.id,
        { publicUrls: true },
      )
      return resolved
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts",
      summary: "Create contact",
      description:
        "Adds a workspace contact outside a channel conversation, with contact details for later messaging. Use `contacts.list` to check for an existing contact and `contacts.sendMessage` after creating one.",
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(createContactRequest)
    .output(contactResponse)
    .errors(possibleErrorsOnCreatingContact)
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

  // Deprecated — use `contacts.list` with a `contactFilter` instead. Kept
  // for backward compatibility with the pre-consolidation
  // `/find-by-custom-field` path; hidden from MCP/CLI tool listings.
  findByCustomField: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/find-by-custom-field",
      summary: "List contacts by custom field",
      description:
        "Deprecated — `contacts.list` with a `contactFilter` covers every case this route did, including the `email`/`phone` custom-field values; this dedicated route is kept only for callers that have not migrated.",
      deprecated: true,
      tags: ["Contacts"],
    })
    .input(publicListContactsByCustomFieldRequest)
    .output(publicListContactsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await contactService.listByCustomFieldValue({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  import: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/import",
      summary: "Import contacts from file",
      description:
        "Starts an asynchronous bulk import of contacts from an uploaded CSV into an inbox. Flow: `contacts.getImportTemplate` for the format, `contacts.createImportUpload` to get a `fileId` and upload URL, upload the file, `contacts.peekImportHeaders` to read its columns, then call this with `channel`, `inboxId`, `fileId` and the column names: `phoneNumber`, `contactId` (a channel user id; required unless the channel is whatsapp), `email`, `firstName`, `lastName`, `sourceUserId` (WhatsApp BSUID). Optional: `fieldMapping` (up to 10 {column, customFieldId}), `tagId` for every contact, `countryCode` for phone normalization, `timezone`. Returns an `importId` immediately; track it with `contacts.getImport`. Only one import can run per workspace: while one is pending or processing this returns 409.",
      successStatus: 201,
      tags: ["Contacts"],
    })
    .input(importContactsRequest)
    .output(importContactsPublicResponse)
    .errors(possibleErrorsOnStartingContactImport)
    .handler(
      async ({ context, input }) =>
        await importService.startContactImport({
          workspaceId: context.workspace.id,
          userId: null,
          inboxId: input.inboxId,
          fileId: input.fileId,
          meta: buildContactImportMeta(input),
          // The token path has no session user; the audit context (owner +
          // token id) still carries the caller's IP and user agent.
          actor: pickAuditRequestInfo(getAuditActor()),
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/contacts/{identifier}",
      summary: "Update contact fields",
      description:
        "Overwrites the given standard and/or custom fields on the contact identified by `identifier`; fields omitted from the body are left unchanged.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z
        .object({
          identifier: publicContactIdentifier,
        })
        .and(updateContactFieldRequest),
    )
    .errors(possibleErrorsOnWritingContactFields)
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

  // Deprecated — use `contacts.update` instead. Kept for backward
  // compatibility with the pre-consolidation `PUT` method on this path;
  // hidden from MCP/CLI tool listings.
  updateLegacy: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}",
      summary: "Update contact fields",
      description:
        "Deprecated — this route used PUT for the same merge-style update `contacts.update` (PATCH) performs today; omitted fields were always left unchanged on both.",
      successStatus: 204,
      deprecated: true,
      tags: ["Contacts"],
    })
    .input(
      z
        .object({
          identifier: publicContactIdentifier,
        })
        .and(updateContactFieldRequest),
    )
    .errors(possibleErrorsOnMutatingResource)
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
      summary: "Delete contact",
      description:
        "Permanently deletes the contact identified by `identifier`. Use `contacts.block` instead if you only need to stop the contact from messaging in.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
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
      summary: "Block contact",
      description:
        "Marks the contact identified by `identifier` as blocked, preventing further inbound messages from reaching the workspace. Use `contacts.unblock` to reverse this.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
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
      summary: "Unblock contact",
      description:
        "Reverses `contacts.block` for the contact identified by `identifier`, allowing inbound messages again.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
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
      summary: "Upsert contact",
      description:
        "Creates the contact identified by `identifier` if it doesn't exist yet, otherwise updates the given fields on the existing one.",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
        firstName: z
          .string()
          .trim()
          .max(100)
          .optional()
          .describe("Contact's first name."),
        lastName: z
          .string()
          .trim()
          .max(100)
          .optional()
          .describe("Contact's last name."),
        email: z
          .union([z.literal(""), z.email().max(100)])
          .optional()
          .describe("Contact's email address, or an empty string to clear it."),
        phoneNumber: z
          .string()
          .min(10)
          .max(20)
          .regex(/\+?\d{10,20}/)
          .optional()
          .describe(
            "Contact's phone number in E.164-like digits (10-20 digits, optional leading +).",
          ),
        avatar: z
          .string()
          .optional()
          .describe("URL of the contact's avatar image."),
        gender: genderTypes.optional().describe("Contact's gender."),
      }),
    )
    .output(contactResponse)
    .errors(possibleErrorsOnUpsertingContact)
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
