import {
  contactCustomFieldService,
  contactService,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
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
      summary: "Get all custom fields from a contact",
      description:
        "Use this to inspect every custom-field value for a contact after resolving its identifier with `contacts.get`. Call `contacts.setCustomField` to change one value or `contacts.setCustomFields` to change several.",
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
      path: "/v1/contacts/{identifier}/custom-fields/{customFieldId}",
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
        customFieldId: zodBigintAsString().describe(
          "Custom field id (numeric string). Get it from `customFields.list`.",
        ),
      }),
    )
    .output(publicContactCustomFieldResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      return await findContactCustomField({
        contactId,
        customFieldId: input.customFieldId,
        workspaceId: context.workspace.id,
      })
    }),

  setCustomField: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contacts/{identifier}/custom-fields/{customFieldId}",
      summary: "Set contact custom field value",
      description:
        "Changes one custom-field value on a resolved contact without altering its other fields. Use `contacts.listCustomFields` to inspect current values, or `contacts.setCustomFields` for several changes.",
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

  setCustomFields: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/contacts/{identifier}/custom-fields",
      summary: "Set multiple custom field values for a contact",
      description:
        "Sets each given custom field to its value on the contact identified by `identifier`; fields not listed are left unchanged. Use `customFields.list`/`customFields.create` first to resolve names to ids.",
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
        fields: z
          .array(
            z.object({
              customFieldId: zodBigintAsString().describe(
                "Custom field id (numeric string). Get it from `customFields.list`.",
              ),
              value: z
                .string()
                .trim()
                .describe("New value for this custom field."),
            }),
          )
          .min(1)
          .max(20)
          .describe("Custom field values to set, up to 20 per request."),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId: context.workspace.id,
      })
      await contactCustomFieldService.setValues({
        workspaceId: context.workspace.id,
        contactId,
        fields: input.fields,
      })
    }),

  applyCustomFieldOperations: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/contacts/{identifier}/custom-fields",
      summary: "Apply arithmetic/append operations to a custom field",
      description:
        'Applies a set of operations to one custom field on the contact, in order. Each operation is one of `set`, `append`, `prepend`, `increase`, `decrease` — `increase`/`decrease` treat the current value as a number (no-op if it is not numeric). Example: `{"operations":[{"customFieldId":"123","operation":"increase","value":"1"}]}` to increment a numeric field.',
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
      summary: "Delete contact custom field by id or name",
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
      summary: "Clear all custom fields from a contact",
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
