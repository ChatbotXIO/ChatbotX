import {
  contactCustomFieldService,
  contactService,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  findContactCustomField,
  listContactCustomFields,
} from "../../queries/list-contact-fields.query"
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
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
    .output(listPublicContactCustomFieldsResponse)
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
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        customFieldId: zodBigintAsString(),
      }),
    )
    .output(publicContactCustomFieldResource)
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
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        customFieldId: zodBigintAsString(),
        value: z.string().trim(),
      }),
    )
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
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        fields: z
          .array(
            z.object({
              customFieldId: zodBigintAsString(),
              value: z.string().trim(),
            }),
          )
          .min(1)
          .max(20),
      }),
    )
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
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const contactId = await contactService.resolveIdByIdentifier({
        identifier: input.identifier,
        workspaceId,
      })

      for (const op of input.operations) {
        await contactCustomFieldService.applyOperationToContacts({
          workspaceId,
          contactIds: [contactId],
          customFieldId: op.customFieldId,
          operation: publicFieldOperationNameToCode[op.operation],
          value: op.value,
        })
      }
    }),

  clearCustomField: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/contacts/{identifier}/custom-fields/{idOrName}",
      summary: "Delete contact custom field by id or name",
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(
      z.object({
        identifier: z.string().min(1),
        idOrName: z.string().min(1),
      }),
    )
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
      successStatus: 204,
      tags: ["Contacts"],
    })
    .input(z.object({ identifier: z.string().min(1) }))
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
