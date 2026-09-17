import {
  contactCustomFieldService,
  contactService,
  customFieldService,
} from "@chatbotx.io/business"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
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
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier: the numeric contact id, an email address, or a phone number.",
          ),
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
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier: the numeric contact id, an email address, or a phone number.",
          ),
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
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier: the numeric contact id, an email address, or a phone number.",
          ),
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

  applyCustomFieldOperations: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/contacts/{identifier}/custom-fields",
      summary: "Apply arithmetic/append operations to custom field",
      description:
        'Applies a batch of operations to one or more custom fields on the contact, in the given order. Each operation is one of `set`, `append`, `prepend`, `increase`, `decrease`: `set` overwrites the current value, `append`/`prepend` concatenate onto it, and `increase`/`decrease` treat the current value as a number (no-op if it is not numeric). This is the batch equivalent of `contacts.setCustomField` for changing several fields in one call. Example: `{"operations":[{"customFieldId":"123","operation":"increase","value":"1"}]}` to increment a numeric field.',
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

      await contactCustomFieldService.applyOperations({
        workspaceId,
        contactId,
        operations: input.operations.map((op) => ({
          customFieldId: op.customFieldId,
          operation: publicFieldOperationNameToCode[op.operation],
          value: op.value,
        })),
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
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier: the numeric contact id, an email address, or a phone number.",
          ),
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
        identifier: z
          .string()
          .min(1)
          .describe(
            "Contact identifier: the numeric contact id, an email address, or a phone number.",
          ),
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
