import {
  contactCustomFieldService,
  contactService,
  externalRequestService,
  externalWebhookService,
  tagService,
} from "@chatbotx.io/business"
import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import type { MakeStepSchema } from "@chatbotx.io/flow-config"
import type { ExecuteStepProps } from "./flow"
import type { ExecuteStepResult } from "./step"

export async function handleMakeStep({
  conversation,
  step,
}: ExecuteStepProps<MakeStepSchema>): Promise<ExecuteStepResult> {
  const { workspaceId, contactId } = conversation

  const registrations = await externalWebhookService.listByWorkspaceAndEvents({
    workspaceId,
    events: step.events,
  })
  if (registrations.length === 0) {
    return { status: "success", result: null }
  }

  const contact = await contactService.findByIdOrFail({
    workspaceId,
    id: contactId,
  })
  const customFields = await contactCustomFieldService.listWithDefinitions({
    contactId,
  })
  const tags = await tagService.listByContactId({ contactId })
  const sequences = await contactSequenceService.listByContactId({
    workspaceId,
    contactId,
  })

  try {
    for (const registration of registrations) {
      const result = await externalRequestService.execute(
        {
          method: "POST",
          url: registration.url,
          headers: [],
          body: {
            bodyType: "json",
            jsonBody: JSON.stringify({
              event: registration.event,
              contact,
              custom_fields: customFields,
              tags: tags.map((tag) => ({ name: tag.name })),
              contact_sequences: sequences,
            }),
          },
        },
        { workspaceId, contactId },
      )

      if (result.statusCode >= 400) {
        return {
          status: "error",
          errorMessage: `Webhook for event "${registration.event}" failed with status ${result.statusCode}`,
          result: null,
        }
      }
    }

    return { status: "success", result: null }
  } catch (error) {
    return {
      status: "error",
      errorMessage:
        error instanceof Error ? error.message : "Make webhook request failed",
      result: null,
    }
  }
}
