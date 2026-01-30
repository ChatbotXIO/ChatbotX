import { prisma } from "@aha.chat/database"
import type {
  EdgeSchema,
  MailchimpAddMemberSchema,
} from "@aha.chat/flow-config"
import {
  integration as integrationMailchimp,
  mailchimpAuthValueSchema,
} from "@aha.chat/integration-mailchimp"
import { SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"

const getMailchimpAuth = async (chatbotId: string) => {
  const mailchimpIntegration =
    await prisma.integrationMailchimp.findFirstOrThrow({
      where: { chatbotId },
    })
  if (!mailchimpIntegration.auth) {
    throw new SdkException("Mailchimp integration auth is missing")
  }
  return mailchimpAuthValueSchema.parse(mailchimpIntegration.auth)
}

export const addMailchimpMember = async (
  props: ExecuteStepProps<MailchimpAddMemberSchema>,
): Promise<void> => {
  const { conversation, step } = props
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
        chatbotFields.flatMap(
          (f: { id: string; name: string; value: string | null }) => [
            [f.id, f.value || ""],
            [f.name, f.value || ""],
          ],
        ),
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
        contactCustomFields.map(
          (cf: { customFieldId: string; value: string }) => [
            cf.customFieldId,
            cf.value || "",
          ],
        ),
      ),
    }

    const email =
      (step.emailField ? fieldMap[step.emailField] : contact.email) || ""

    if (!email) {
      throw new Error("Email is required")
    }

    const mergeFields: Record<string, unknown> = {}
    if (contact.firstName) {
      mergeFields.FNAME = contact.firstName
    }
    if (contact.lastName) {
      mergeFields.LNAME = contact.lastName
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

    const mailchimpProps = {
      listId: step.listId,
      email,
      status: (step.doubleOptIn ? "pending" : step.status) as
        | "subscribed"
        | "unsubscribed"
        | "cleaned"
        | "pending"
        | "transactional",
      tags: step.tags,
      mergeFields,
      skipMergeValidation: true,
    }

    await integrationMailchimp.actions.addMember({
      ctx: { auth },
      props: mailchimpProps,
    })

    await sendFlow(props, true)
  } catch (error: unknown) {
    logger.error(`[Mailchimp] Error for ${conversationId}:`, error)
    await sendFlow(props, false)
  }
}

const sendFlow = async (
  {
    conversation,
    flowVersion,
    step,
  }: ExecuteStepProps<MailchimpAddMemberSchema>,
  isSuccess: boolean,
) => {
  const nodeId = isSuccess ? step.successNodeId : step.errorNodeId
  if (!nodeId) {
    return
  }

  const foundEdge = (flowVersion.edges as unknown as EdgeSchema[])?.find(
    (e) => e.sourceHandle === nodeId,
  )

  if (foundEdge) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        flowId: flowVersion.flowId,
        flowVersionId: flowVersion.id,
        nodeId: foundEdge.target,
      },
    })
  }
}
