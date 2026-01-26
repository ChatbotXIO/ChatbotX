import { prisma } from "@aha.chat/database"
import {
  type EdgeSchema,
  edgeSchema,
  type MoosendStepSchema,
} from "@aha.chat/flow-config"
import {
  integration as integrationMoosend,
  type MoosendAuthValue,
  moosendAuthValueSchema,
} from "@aha.chat/integration-moosend"
import { SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { z } from "zod"
import { logger } from "../../lib/logger"
import type { FlowStepProps } from "./step-handler"

const getMoosendAuth = async (chatbotId: string): Promise<MoosendAuthValue> => {
  const moosendIntegration = await prisma.integrationMoosend.findFirst({
    where: { chatbotId },
  })

  if (!moosendIntegration) {
    throw new SdkException("Moosend integration is missing")
  }

  const { apiKey } = moosendIntegration

  if (!apiKey) {
    throw new SdkException("Moosend integration auth is missing")
  }

  return moosendAuthValueSchema.parse({
    apiKey,
  })
}

export const handleMoosendStep = async ({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<MoosendStepSchema>) => {
  const { id: conversationId, chatbotId, contactId } = conversation

  try {
    const [auth, contact, contactCustomFields, chatbotFields] =
      await Promise.all([
        getMoosendAuth(chatbotId),
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

    const name = step.nameField ? fieldMap[step.nameField] : undefined

    if (!step.listId) {
      throw new SdkException("List ID is required")
    }

    await integrationMoosend.actions.createContact({
      ctx: { auth },
      props: {
        email,
        name,
        listId: step.listId,
      },
    })

    await sendFlow({ conversation, flowVersionId, step }, true)
  } catch (error: unknown) {
    logger.error(`[Moosend] Error for ${conversationId}:`, error)
    await sendFlow({ conversation, flowVersionId, step }, false)
  }
}

const sendFlow = async (
  { conversation, flowVersionId, step }: FlowStepProps<MoosendStepSchema>,
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
