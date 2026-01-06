import { prisma } from "@aha.chat/database"
import type {
  EdgeSchema,
  MailchimpAddMemberSchema,
} from "@aha.chat/flow-config"
import {
  integration as integrationMailchimp,
  type MailchimpAuthValue,
} from "@aha.chat/integration-mailchimp"
import { SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"
import type { FlowStepProps } from "./step-handler"

const getMailchimpAuth = async (chatbotId: string) => {
  const mailchimpIntegration = await prisma.integrationMailchimp.findFirst({
    where: { chatbotId },
  })
  if (!mailchimpIntegration?.auth) {
    throw new SdkException("Mailchimp integration auth is missing")
  }
  return mailchimpIntegration.auth as unknown as MailchimpAuthValue
}

export const addMailchimpMember = async ({
  conversation,
  flowVersionId,
  step,
}: FlowStepProps<MailchimpAddMemberSchema>) => {
  const { id: conversationId, chatbotId, contactId } = conversation

  try {
    const [auth, contact, contactCustomFields, chatbotFields] =
      await Promise.all([
        getMailchimpAuth(chatbotId),
        prisma.contact.findUnique({ where: { id: contactId } }),
        prisma.contactCustomField.findMany({ where: { contactId } }),
        prisma.field.findMany({ where: { chatbotId } }),
      ])

    if (!contact) {
      throw new Error("Contact not found")
    }

    // Pre-process all fields into a single lookup map (Priority: Default Fields < System Fields < Contact Fields)
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
      gender: contact.gender || "",
      avatar: contact.avatar || "",
      phoneNumber: contact.phoneNumber || "",
      firstName: contact.firstName || "",
      lastName: contact.lastName || "",
      ...Object.fromEntries(
        contactCustomFields.map((cf) => [cf.customFieldId, cf.value || ""]),
      ),
    }

    const email =
      (step.emailField ? fieldMap[step.emailField] : contact.email) || ""

    if (!email) {
      throw new Error("Email is required")
    }

    const mergeFields: Record<string, unknown> = {
      ADDRESS: "",
      PHONE: "",
      BIRTHDAY: "",
      COMPANY: "",
      ...(contact.firstName && { FNAME: contact.firstName }),
      ...(contact.lastName && { LNAME: contact.lastName }),
    }

    for (const { chatbotField, mailchimpTag } of step.mergeFields || []) {
      const value = chatbotField ? fieldMap[chatbotField] : null
      if (!value) {
        continue
      }

      let tag = mailchimpTag.toUpperCase().replace(/\s+/g, "")
      if (tag === "PHONENUMBER") {
        tag = "PHONE"
      }

      if (tag === "ADDRESS" && typeof value === "string" && value.trim()) {
        mergeFields[tag] = {
          addr1: value.trim(),
          city: "",
          state: "",
          zip: "",
        }
      } else {
        mergeFields[tag] = value
      }
    }

    await integrationMailchimp.actions.addMember({
      ctx: { auth },
      props: {
        listId: step.listId,
        email,
        status: (step.doubleOptIn
          ? "pending"
          : step.status) as MailchimpAddMemberSchema["status"],
        tags: step.tags,
        mergeFields,
        skipMergeValidation: true,
      },
    })

    await sendFlow({ conversation, flowVersionId, step }, true)
  } catch (error: unknown) {
    const err = error as { response?: { body?: unknown }; data?: unknown }
    logger.error(
      `[Mailchimp] Error for ${conversationId}:`,
      JSON.stringify(err.response?.body || err.data || err, null, 2),
    )
    await sendFlow({ conversation, flowVersionId, step }, false)
  }
}

const sendFlow = async (
  {
    conversation,
    flowVersionId,
    step,
  }: FlowStepProps<MailchimpAddMemberSchema>,
  isSuccess: boolean,
) => {
  const currentFlow = await prisma.flowVersion.findUnique({
    where: { id: flowVersionId },
    select: { edges: true },
  })

  const nodeId = isSuccess ? step.successNodeId : step.errorNodeId
  const foundEdge = (currentFlow?.edges as unknown as EdgeSchema[])?.find(
    (e) => e.sourceHandle === nodeId,
  )

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
