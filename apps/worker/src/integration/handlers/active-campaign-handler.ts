import { prisma } from "@aha.chat/database"
import {
  ActiveCampaignOperation,
  type ActiveCampaignStepSchema,
  type EdgeSchema,
  edgeSchema,
} from "@aha.chat/flow-config"
import {
  type ActiveCampaignAuthValue,
  activeCampaignAuthValueSchema,
  integration as integrationAC,
} from "@aha.chat/integration-active-campaign"
import { SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { z } from "zod"
import { logger } from "../../lib/logger"
import type { FlowStepProps } from "./step-handler"

const getActiveCampaignAuth = async (
  chatbotId: string,
): Promise<ActiveCampaignAuthValue> => {
  const acIntegration = await prisma.integrationActiveCampaign.findFirst({
    where: { chatbotId },
  })

  if (!acIntegration) {
    throw new SdkException("ActiveCampaign integration is missing")
  }

  const { apiUrl, apiKey } = acIntegration

  if (!apiUrl) {
    throw new SdkException("ActiveCampaign integration auth is missing")
  }

  if (!apiKey) {
    throw new SdkException("ActiveCampaign integration auth is missing")
  }

  return activeCampaignAuthValueSchema.parse({
    apiUrl,
    apiKey,
  })
}

export const handleActiveCampaignStep = async ({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<ActiveCampaignStepSchema>) => {
  const { id: conversationId, chatbotId, contactId } = conversation

  try {
    const [auth, contact, contactCustomFields, chatbotFields] =
      await Promise.all([
        getActiveCampaignAuth(chatbotId),
        prisma.contact.findUnique({ where: { id: contactId } }),
        prisma.contactCustomField.findMany({ where: { contactId } }),
        prisma.field.findMany({ where: { chatbotId } }),
      ])

    if (!contact) {
      throw new SdkException("Contact not found")
    }

    const fieldMap: Record<string, string> = {
      ...Object.fromEntries(
        chatbotFields.flatMap((f) => [
          [f.id, f.value || ""],
          [f.name, f.value || ""],
        ]),
      ),
      email: contact.email || "",
      phone_number: contact.phoneNumber || "",
      first_name: contact.firstName || "",
      last_name: contact.lastName || "",
      full_name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
      ...Object.fromEntries(
        contactCustomFields.map((cf) => [cf.customFieldId, cf.value || ""]),
      ),
    }

    const email =
      (step.emailField ? fieldMap[step.emailField] : contact.email) || ""
    if (!email) {
      throw new SdkException("Email is required")
    }

    if (step.operation === ActiveCampaignOperation.createOrUpdate) {
      const phone = step.phoneField ? fieldMap[step.phoneField] : undefined

      // Fetch all custom fields to map names to IDs if needed
      const acFields = await integrationAC.actions.getCustomFields({
        ctx: { auth },
        props: {},
      })

      const fieldValues = (step.mergeFields || [])
        .map((m) => {
          const value = fieldMap[m.chatbotField] || ""
          if (!value) {
            return null
          }

          // Try to find field ID by name if it's not already a numeric ID
          let fieldId = m.activeCampaignField
          const foundField = acFields.find(
            (f) =>
              f.title.toLowerCase() === m.activeCampaignField.toLowerCase() ||
              f.id === m.activeCampaignField,
          )
          if (foundField) {
            fieldId = foundField.id
          }

          return {
            field: fieldId,
            value,
          }
        })
        .filter((v): v is { field: string; value: string } => !!v)

      const { contact: acContact } = await integrationAC.actions.syncContact({
        ctx: { auth },
        props: {
          email,
          firstName: contact.firstName || undefined,
          lastName: contact.lastName || undefined,
          phone: phone || undefined,
          fieldValues,
        },
      })

      if (step.listId) {
        try {
          await integrationAC.actions.updateContactLists({
            ctx: { auth },
            props: {
              contactId: acContact.id,
              listId: step.listId,
              status: 1, // 1 for subscribed
            },
          })
        } catch (error) {
          const isAlreadyInList =
            error instanceof Error &&
            (error.message.includes("already in this list") ||
              error.message.includes("422"))
          if (!isAlreadyInList) {
            throw error
          }
          logger.warn(
            `[ActiveCampaign] Contact ${acContact.id} already in list ${step.listId}:`,
            error,
          )
        }
      }

      if (step.tags && step.tags.length > 0) {
        const acTags = await integrationAC.actions.getTags({
          ctx: { auth },
          props: {},
        })
        for (const tagName of step.tags) {
          const foundTag = acTags.find((t) => t.tag === tagName)
          if (foundTag) {
            try {
              await integrationAC.actions.updateContactTags({
                ctx: { auth },
                props: { contactId: acContact.id, tagId: foundTag.id },
              })
            } catch (error) {
              const isAlreadyTagged =
                error instanceof Error &&
                (error.message.includes("already exists on contact") ||
                  error.message.includes("422"))
              if (!isAlreadyTagged) {
                throw error
              }
              logger.warn(
                `[ActiveCampaign] Contact ${acContact.id} already has tag ${tagName}:`,
                error,
              )
            }
          }
        }
      }
    } else if (step.operation === ActiveCampaignOperation.addToAutomation) {
      const { contact: acContact } = await integrationAC.actions.syncContact({
        ctx: { auth },
        props: {
          email,
          firstName: contact.firstName || undefined,
          lastName: contact.lastName || undefined,
        },
      })

      try {
        await integrationAC.actions.addContactToAutomation({
          ctx: { auth },
          props: {
            contactId: acContact.id,
            automationId: step.automationId,
          },
        })
      } catch (error) {
        // Ignore "Could not create SubscriberSeries" error which usually means
        // the contact is already in the automation or it's a conflict
        const isAlreadyInAutomation =
          error instanceof Error &&
          (error.message.includes("Could not create SubscriberSeries") ||
            error.message.includes("422"))

        if (!isAlreadyInAutomation) {
          throw error
        }
        logger.warn(
          `[ActiveCampaign] Contact ${acContact.id} already in automation ${step.automationId} or conflict:`,
          error,
        )
      }
    }

    await sendFlow({ conversation, flowVersionId, step }, true)
  } catch (error: unknown) {
    logger.error(`[ActiveCampaign] Error for ${conversationId}:`, error)
    await sendFlow({ conversation, flowVersionId, step }, false)
  }
}

const sendFlow = async (
  {
    conversation,
    flowVersionId,
    step,
  }: FlowStepProps<ActiveCampaignStepSchema>,
  isSuccess: boolean,
) => {
  const currentFlow = await prisma.flowVersion.findUnique({
    where: { id: flowVersionId },
    select: { edges: true },
  })

  const nodeId = isSuccess ? step.successNodeId : step.errorNodeId
  const edges = z.array(edgeSchema).safeParse(currentFlow?.edges)
  const foundEdge = edges.success
    ? edges.data.find((e: EdgeSchema) => e.sourceHandle === nodeId)
    : null

  if (foundEdge) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        flowVersionId,
        nodeId: foundEdge.target,
      },
    })
  }
}
