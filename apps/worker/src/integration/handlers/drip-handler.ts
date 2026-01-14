import { prisma } from "@aha.chat/database"
import {
  type DripStepSchema,
  type EdgeSchema,
  edgeSchema,
} from "@aha.chat/flow-config"
import {
  type DripAuthValue,
  dripAuthValueSchema,
  integration as integrationDrip,
} from "@aha.chat/integration-drip"
import { SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { z } from "zod"
import { logger } from "../../lib/logger"
import type { FlowStepProps } from "./step-handler"

const getDripAuth = async (chatbotId: string): Promise<DripAuthValue> => {
  const dripIntegration = await prisma.integrationDrip.findFirst({
    where: { chatbotId },
  })

  if (!dripIntegration) {
    throw new SdkException("Drip integration is missing")
  }

  const { apiToken, accountId } = dripIntegration

  if (!(apiToken && accountId)) {
    throw new SdkException("Drip integration auth is missing")
  }

  return dripAuthValueSchema.parse({
    apiToken,
    accountId,
  })
}

export const handleDripStep = async ({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<DripStepSchema>) => {
  const { id: conversationId, chatbotId, contactId } = conversation

  try {
    const [auth, contact, contactCustomFields, chatbotFields] =
      await Promise.all([
        getDripAuth(chatbotId),
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

    const phone = step.phoneField ? fieldMap[step.phoneField] : undefined

    const customFields: Record<string, string> = {}
    for (const m of step.mergeFields || []) {
      const value = fieldMap[m.chatbotField] || ""
      if (value) {
        customFields[m.dripField] = value
      }
    }

    await integrationDrip.actions.syncSubscriber({
      ctx: { auth },
      props: {
        email,
        firstName: contact.firstName || undefined,
        lastName: contact.lastName || undefined,
        phone: phone || undefined,
        tags: step.tags,
        customFields,
      },
    })

    await sendFlow({ conversation, flowVersionId, step }, true)
  } catch (error: unknown) {
    logger.error(`[Drip] Error for ${conversationId}:`, error)
    await sendFlow({ conversation, flowVersionId, step }, false)
  }
}

const sendFlow = async (
  { conversation, flowVersionId, step }: FlowStepProps<DripStepSchema>,
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
