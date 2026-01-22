import { prisma } from "@aha.chat/database"
import {
  type EdgeSchema,
  edgeSchema,
  type SendFoxStepSchema,
} from "@aha.chat/flow-config"
import {
  integration as integrationSendFox,
  type SendFoxAuthValue,
  sendFoxAuthValueSchema,
} from "@aha.chat/integration-send-fox"
import { SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { z } from "zod"
import { logger } from "../../lib/logger"
import type { FlowStepProps } from "./step-handler"

const getSendFoxAuth = async (chatbotId: string): Promise<SendFoxAuthValue> => {
  const sendFoxIntegration = await prisma.integrationSendFox.findFirst({
    where: { chatbotId },
  })

  if (!sendFoxIntegration) {
    throw new SdkException("SendFox integration is missing")
  }

  const { accessToken } = sendFoxIntegration

  if (!accessToken) {
    throw new SdkException("SendFox integration auth is missing")
  }

  return sendFoxAuthValueSchema.parse({
    accessToken,
  })
}

export const handleSendFoxStep = async ({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<SendFoxStepSchema>) => {
  const { id: conversationId, chatbotId, contactId } = conversation

  try {
    const [auth, contact, contactCustomFields, chatbotFields] =
      await Promise.all([
        getSendFoxAuth(chatbotId),
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

    const listIds = step.listId ? [Number.parseInt(step.listId, 10)] : undefined

    await integrationSendFox.actions.createContact({
      ctx: { auth },
      props: {
        email,
        firstName: contact.firstName || undefined,
        lastName: contact.lastName || undefined,
        listIds,
      },
    })

    await sendFlow({ conversation, flowVersionId, step }, true)
  } catch (error: unknown) {
    logger.error(`[SendFox] Error for ${conversationId}:`, error)
    await sendFlow({ conversation, flowVersionId, step }, false)
  }
}

const sendFlow = async (
  { conversation, flowVersionId, step }: FlowStepProps<SendFoxStepSchema>,
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
