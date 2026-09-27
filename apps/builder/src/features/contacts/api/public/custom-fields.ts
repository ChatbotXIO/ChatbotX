import {
  contactCustomFieldService,
  contactService,
  customFieldService,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicContactIdentifier } from "@/lib/public-api/contact-identifier"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  findContactCustomField,
  listContactCustomFields,
} from "../../lib/list-contact-fields"
import {
  listPublicContactCustomFieldsResponse,
  publicContactCustomFieldResource,
} from "../../schema/contact-custom-field"
import {
  addContactCustomFieldOperationsPublicRequest,
  publicFieldOperationNameToCode,
} from "../../schema/public/custom-fields"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactsCustomFieldsPublicRouter = {
  listCustomFields: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/custom-fields",
      summary: "Get all custom fields from contact",
      description:
        "Use this to inspect every custom-field value for a contact after resolving its identifier with `contacts.get`. Call `contacts.setCustomField` to change one value or `contacts.applyCustomFieldOperations` to change several in one call.",
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
      }),
    )
    .output(listPublicContactCustomFieldsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      return await listContactCustomFields({
        workspaceId: context.workspace.id,
        contactId,
      })
    }),

  getCustomField: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contacts/{identifier}/custom-fields/{idOrName}",
      summary: "Get contact custom field value",
      description:
        "Returns one custom field's current value for the contact identified by `identifier`. Use `contacts.listCustomFields` to see every field at once.",
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
        idOrName: z
          .string()
          .min(1)
          .describe(
            "Custom field id (numeric string) or field name. Get either from `customFields.list`.",
          ),
      }),
    )
    .output(publicContactCustomFieldResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      const field = await customFieldService.findByKeyOrFail({
        workspaceId,
        key: input.idOrName,
      })
      return await findContactCustomField({
        contactId,
        customFieldId: field.id,
        workspaceId,
      })
    }),

  setCustomField: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}/custom-fields/{idOrName}",
      summary: "Set contact custom field value",
      description:
        "Changes one custom-field value on a resolved contact without altering its other fields. Use `contacts.listCustomFields` to inspect current values, or `contacts.applyCustomFieldOperations` for several changes.",
      successStatus: 204,
      tags: ["Contacts"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
        idOrName: z
          .string()
          .min(1)
          .describe(
            "Custom field id (numeric string) or field name. Get either from `customFields.list`.",
          ),
        value: z.string().trim().describe("New value for the custom field."),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })
      const field = await customFieldService.findByKeyOrFail({
        workspaceId,
        key: input.idOrName,
      })
      await contactCustomFieldService.setValueForContact({
        workspaceId,
        contactId,
        customFieldId: field.id,
        value: input.value,
      })
    }),

  // Deprecated — use `contacts.setCustomField` instead. Kept for backward
  // compatibility with the pre-consolidation `POST .../{customFieldId}`
  // path and method; hidden from MCP/CLI tool listings.
  setCustomFieldLegacy: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/custom-fields/{customFieldId}",
      summary: "Set contact custom field value",
      description:
        "Deprecated — `contacts.setCustomField` now covers this at `PUT .../custom-fields/{idOrName}`, addressed by id or name; this POST route only ever accepted a numeric id.",
      successStatus: 204,
      deprecated: true,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
        customFieldId: zodBigintAsString().describe(
          "Custom field id (numeric string). Get it from `customFields.list`.",
        ),
        value: z.string().trim().describe("New value for the custom field."),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactCustomFieldService.setValueForContact({
        workspaceId: context.workspace.id,
        contactId,
        customFieldId: input.customFieldId,
        value: input.value,
      })
    }),

  applyCustomFieldOperations: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/contacts/{identifier}/custom-fields",
      summary: "Apply arithmetic/append operations to custom field",
      description:
        'Applies a batch of operations to one or more custom fields on the contact, in the given order, each addressed by id or name. Each operation is one of `set`, `append`, `prepend`, `increase`, `decrease`: `set` overwrites the current value, `append`/`prepend` concatenate onto it, and `increase`/`decrease` treat the current value as a number (no-op if it is not numeric). This is the batch equivalent of `contacts.setCustomField` for changing several fields in one call. Example: `{"operations":[{"customFieldId":"123","operation":"increase","value":"1"}]}` to increment a numeric field.',
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(addContactCustomFieldOperationsPublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })

      // Resolved outside `applyOperations`' own transaction — a field
      // deleted between this lookup and the write already throws
      // `notFoundException` inside that transaction and rolls back, so a
      // `tx`-aware lookup here would buy nothing.
      const operations = await Promise.all(
        input.operations.map(async (op) => {
          const field = await customFieldService.findByKeyOrFail({
            workspaceId,
            key: op.customFieldId,
          })
          return {
            customFieldId: field.id,
            operation: publicFieldOperationNameToCode[op.operation],
            value: op.value,
          }
        }),
      )

      await contactCustomFieldService.applyOperations({
        workspaceId,
        contactId,
        operations,
      })
    }),

  clearCustomField: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/custom-fields/{idOrName}",
      summary: "Delete contact custom field",
      description:
        "Removes one custom-field value from the contact identified by `identifier`, matched by id or field name. Use `contacts.clearCustomFields` to clear every field at once.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
        idOrName: z
          .string()
          .min(1)
          .describe("Custom field id (numeric string) or exact field name."),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactCustomFieldService.deleteByKey({
        workspaceId: context.workspace.id,
        contactId,
        keyword: input.idOrName,
      })
    }),

  clearCustomFields: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/custom-fields",
      summary: "Clear all custom fields from contact",
      description:
        "Removes every custom-field value from the contact identified by `identifier`. Use `contacts.clearCustomField` to remove just one.",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: publicContactIdentifier,
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactCustomFieldService.clearByContactId({
        workspaceId: context.workspace.id,
        contactId,
      })
    }),
}
