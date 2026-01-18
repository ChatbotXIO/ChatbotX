import { prisma } from "@aha.chat/database"
import {
  type EdgeSchema,
  edgeSchema,
  type KlaviyoStepSchema,
} from "@aha.chat/flow-config"
import {
  integration as integrationKlaviyo,
  type KlaviyoAuthValue,
  klaviyoAuthValueSchema,
} from "@aha.chat/integration-klaviyo"
import { AuthType, SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { z } from "zod"
import { logger } from "../../lib/logger"
import type { FlowStepProps } from "./step-handler"

const getKlaviyoAuth = async (chatbotId: string): Promise<KlaviyoAuthValue> => {
  const klaviyoIntegration = await prisma.integrationKlaviyo.findFirst({
    where: { chatbotId },
  })

  if (!klaviyoIntegration) {
    throw new SdkException("Klaviyo integration is missing")
  }

  const { apiKey } = klaviyoIntegration

  if (!apiKey) {
    throw new SdkException("Klaviyo integration auth is missing")
  }

  return klaviyoAuthValueSchema.parse({
    apiKey,
    authType: AuthType.secretText,
  })
}

export const handleKlaviyoStep = async ({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<KlaviyoStepSchema>) => {
  const { id: conversationId, chatbotId, contactId } = conversation

  try {
    const [auth, contact, contactCustomFields, chatbotFields] =
      await Promise.all([
        getKlaviyoAuth(chatbotId),
        prisma.contact.findUnique({ where: { id: contactId } }),
        prisma.contactCustomField.findMany({ where: { contactId } }),
        prisma.field.findMany({ where: { chatbotId } }),
      ])

    if (!contact) {
      throw new SdkException("Contact not found")
    }

    const fieldMap: Record<string, string> = {
      email: contact.email || "",
      phone_number: contact.phoneNumber || "",
      first_name: contact.firstName || "",
      last_name: contact.lastName || "",
      full_name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
    }

    for (const f of chatbotFields) {
      fieldMap[f.id] = f.value || ""
      fieldMap[f.name] = f.value || ""
    }

    for (const cf of contactCustomFields) {
      fieldMap[cf.customFieldId] = cf.value || ""
    }

    const email =
      (step.emailField ? fieldMap[step.emailField] : contact.email) || ""
    if (!email) {
      throw new SdkException("Email is required")
    }

    const phone = step.phoneField ? fieldMap[step.phoneField] : undefined
    const title = step.titleField ? fieldMap[step.titleField] : undefined
    const organization = step.orgField ? fieldMap[step.orgField] : undefined

    logger.info(
      {
        conversationId,
        contactId,
        chatbotId,
        email,
        phone: phone || undefined,
        listId: step.listId || undefined,
      },
      "[Klaviyo] Sync profile",
    )

    await integrationKlaviyo.actions.syncProfile({
      ctx: { auth },
      props: {
        email,
        phone: phone || undefined,
        firstName: contact.firstName || undefined,
        lastName: contact.lastName || undefined,
        title: title || undefined,
        organization: organization || undefined,
        listId: step.listId || undefined,
      },
    })

    await sendFlow({ conversation, flowVersionId, step }, true)
  } catch (error: unknown) {
    logger.error(
      {
        conversationId,
        contactId,
        chatbotId,
        error,
      },
      "[Klaviyo] Error syncing profile",
    )
    await sendFlow({ conversation, flowVersionId, step }, false)
  }
}

const sendFlow = async (
  { conversation, flowVersionId, step }: FlowStepProps<KlaviyoStepSchema>,
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
