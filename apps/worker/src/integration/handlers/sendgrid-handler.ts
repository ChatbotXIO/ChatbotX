import { prisma } from "@aha.chat/database"
import {
  type EdgeSchema,
  edgeSchema,
  type SendGridStepSchema,
} from "@aha.chat/flow-config"
import { integration as integrationSendGrid } from "@aha.chat/integration-sendgrid"
import { AuthType, SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { z } from "zod"
import { logger } from "../../lib/logger"
import type { FlowStepProps } from "./step-handler"

export const handleSendGridStep = async ({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<SendGridStepSchema>) => {
  const { id: conversationId, chatbotId, contactId } = conversation

  try {
    const [sendgridIntegration, contact, contactCustomFields, chatbotFields] =
      await Promise.all([
        prisma.integrationSendGrid.findFirst({
          where: { chatbotId },
        }),
        prisma.contact.findUnique({ where: { id: contactId } }),
        prisma.contactCustomField.findMany({ where: { contactId } }),
        prisma.field.findMany({ where: { chatbotId } }),
      ])

    if (!sendgridIntegration) {
      throw new SdkException("SendGrid integration is missing")
    }

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

    const phone = step.phoneField ? fieldMap[step.phoneField] : undefined

    const customFields: Record<string, string> = {}
    for (const m of step.mergeFields || []) {
      const value = fieldMap[m.chatbotField] || ""
      if (value) {
        customFields[m.sendGridField] = value
      }
    }

    const payload = {
      email,
      firstName: contact.firstName || undefined,
      lastName: contact.lastName || undefined,
      phone: phone || undefined,
      listIds: step.listId ? [step.listId] : undefined,
      customFields,
    }

    logger.info(
      `[SendGrid] Adding/Updating contact for conversation ${conversationId}`,
      { payload },
    )

    const result = await integrationSendGrid.actions.addOrUpdateContact({
      ctx: {
        auth: {
          apiKey: sendgridIntegration.apiKey,
          authType: AuthType.secretText,
        },
      },
      props: payload,
    })

    logger.info(
      `[SendGrid] Successfully added/updated contact for conversation ${conversationId}`,
      { result },
    )

    await sendFlow({ conversation, flowVersionId, step }, true)
  } catch (error: unknown) {
    logger.error(`[SendGrid] Error for ${conversationId}:`, error)
    await sendFlow({ conversation, flowVersionId, step }, false)
  }
}

const sendFlow = async (
  { conversation, flowVersionId, step }: FlowStepProps<SendGridStepSchema>,
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
