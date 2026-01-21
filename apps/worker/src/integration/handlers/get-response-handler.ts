import { prisma } from "@aha.chat/database"
import {
  type EdgeSchema,
  edgeSchema,
  type GetResponseStepSchema,
} from "@aha.chat/flow-config"
import { integration as integrationGetResponse } from "@aha.chat/integration-get-response"
import { AuthType, SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { z } from "zod"
import { logger } from "../../lib/logger"
import type { FlowStepProps } from "./step-handler"

export const handleGetResponseStep = async ({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<GetResponseStepSchema>) => {
  const { id: conversationId, chatbotId, contactId } = conversation

  try {
    const [getResponseIntegration, contact, contactCustomFields] =
      await Promise.all([
        prisma.integrationGetResponse.findFirst({
          where: { chatbotId },
        }),
        prisma.contact.findUnique({ where: { id: contactId } }),
        prisma.contactCustomField.findMany({ where: { contactId } }),
      ])

    if (!getResponseIntegration) {
      throw new SdkException("GetResponse integration is missing")
    }

    if (!contact) {
      throw new SdkException("Contact not found")
    }

    const fieldMap: Record<string, string> = {
      email: contact.email || "",
      phone_number: contact.phoneNumber || "",
      first_name: contact.firstName || "",
      last_name: contact.lastName || "",
      full_name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
      ...Object.fromEntries(
        contactCustomFields.map((cf) => [cf.customFieldId, cf.value || ""]),
      ),
    }

    const email = fieldMap[step.emailField] || contact.email || ""
    if (!email) {
      throw new SdkException("Email is required")
    }

    if (!step.campaignId) {
      throw new SdkException("Campaign (List) is required")
    }

    const name = `${contact.firstName || ""} ${contact.lastName || ""}`.trim()

    const props = {
      email,
      name: name && name.length >= 3 ? name : undefined,
      campaignId: step.campaignId,
      dayOfCycle:
        step.dayOfCycle && step.dayOfCycle.trim() !== ""
          ? step.dayOfCycle
          : undefined,
      tags: step.tags,
    }

    await integrationGetResponse.actions.addOrUpdateContact({
      ctx: {
        auth: {
          apiKey: getResponseIntegration.apiKey,
          authType: AuthType.secretText,
        },
      },
      props,
    })

    await sendFlow({ conversation, flowVersionId, step }, true)
  } catch (error: unknown) {
    logger.error(`[GetResponse] Error for ${conversationId}:`, error)
    await sendFlow({ conversation, flowVersionId, step }, false)
  }
}

const sendFlow = async (
  { conversation, flowVersionId, step }: FlowStepProps<GetResponseStepSchema>,
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
