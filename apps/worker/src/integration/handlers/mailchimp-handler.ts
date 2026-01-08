import { prisma } from "@aha.chat/database"
import {
  type EdgeSchema,
  edgeSchema,
  type MailchimpAddMemberSchema,
} from "@aha.chat/flow-config"
import {
  integration as integrationMailchimp,
  type MailchimpAuthValue,
  mailchimpAuthValueSchema,
} from "@aha.chat/integration-mailchimp"
import { SdkException } from "@aha.chat/sdk"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import { format, isValid, parse } from "date-fns"
import { z } from "zod"
import { logger } from "../../lib/logger"
import type { FlowStepProps } from "./step-handler"

const getMailchimpAuth = async (
  chatbotId: string,
): Promise<MailchimpAuthValue> => {
  const mailchimpIntegration = await prisma.integrationMailchimp.findFirst({
    where: { chatbotId },
    select: { auth: true },
  })

  if (!mailchimpIntegration?.auth) {
    throw new SdkException("Mailchimp integration auth is missing")
  }

  return mailchimpAuthValueSchema.parse(mailchimpIntegration.auth)
}

const isMailchimpError = (
  error: unknown,
): error is { response?: { body?: unknown }; data?: unknown } => {
  return (
    typeof error === "object" &&
    error !== null &&
    ("response" in error || "data" in error)
  )
}

const parseFlexibleDate = (value: string): Date | null => {
  if (!value) {
    return null
  }

  const formats = ["dd/MM/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "MM/dd/yyyy"]

  for (const f of formats) {
    try {
      const d = parse(value, f, new Date())
      if (isValid(d)) {
        return d
      }
    } catch {
      /* ignore parse error and try next format */
    }
  }

  const fallbackDate = new Date(value)
  return isValid(fallbackDate) ? fallbackDate : null
}

const buildFieldMap = (
  contact: NonNullable<Awaited<ReturnType<typeof prisma.contact.findUnique>>>,
  chatbotFields: Awaited<ReturnType<typeof prisma.field.findMany>>,
  contactCustomFields: Awaited<
    ReturnType<typeof prisma.contactCustomField.findMany>
  >,
): Record<string, string> => {
  const fieldMap: Record<string, string> = {
    email: contact.email || "",
    first_name: contact.firstName || "",
    last_name: contact.lastName || "",
    full_name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim(),
    phone_number: contact.phoneNumber || "",
    gender: contact.gender || "",
    avatar: contact.avatar || "",
  }

  for (const f of chatbotFields) {
    fieldMap[f.id] = f.value || ""
    fieldMap[f.name] = f.value || ""
  }

  const cfDefinitionMap = new Map(chatbotFields.map((f) => [f.id, f]))
  for (const cf of contactCustomFields) {
    const value = cf.value || ""
    fieldMap[cf.customFieldId] = value
    const def = cfDefinitionMap.get(cf.customFieldId)
    if (def) {
      fieldMap[def.name] = value
    }
  }

  return fieldMap
}

const processMergeField = (
  value: string,
  mailchimpTag: string,
  mailchimpType?: string,
): unknown => {
  const tag = mailchimpTag.toUpperCase().replace(/\s+/g, "")

  if (tag === "ADDRESS") {
    return { addr1: value.trim(), city: "", state: "", zip: "" }
  }

  if (mailchimpType === "birthday" || tag === "BIRTHDAY") {
    const date = parseFlexibleDate(value)
    return date ? format(date, "MM/dd") : value
  }

  if (mailchimpType === "date") {
    const date = parseFlexibleDate(value)
    return date ? format(date, "yyyy-MM-dd") : value
  }

  return value
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
        prisma.contact.findUniqueOrThrow({ where: { id: contactId } }),
        prisma.contactCustomField.findMany({ where: { contactId } }),
        prisma.field.findMany({ where: { chatbotId } }),
      ])

    const fieldMap = buildFieldMap(contact, chatbotFields, contactCustomFields)

    const email =
      (step.emailField ? fieldMap[step.emailField] : contact.email) || ""
    if (!email) {
      logger.error(`[Mailchimp] Email is required for ${conversationId}`)
      await sendFlow({ conversation, flowVersionId, step }, false)
      return
    }

    const mergeFields: Record<string, unknown> = {
      ADDRESS: "",
      PHONE: contact.phoneNumber || "",
      BIRTHDAY: "",
      COMPANY: "",
      ...(contact.firstName && { FNAME: contact.firstName }),
      ...(contact.lastName && { LNAME: contact.lastName }),
    }

    for (const field of step.mergeFields || []) {
      const { chatbotField, mailchimpTag, mailchimpType } = field
      if (!mailchimpTag) {
        continue
      }

      const value = chatbotField ? fieldMap[chatbotField] : null
      if (!value) {
        continue
      }

      const tag = mailchimpTag.toUpperCase().replace(/\s+/g, "")

      if (tag === "PHONE" || tag === "PHONENUMBER") {
        mergeFields.PHONE = value
      } else {
        mergeFields[tag] = processMergeField(value, mailchimpTag, mailchimpType)
      }
    }

    const status = step.doubleOptIn ? ("pending" as const) : step.status

    await integrationMailchimp.actions.addMember({
      ctx: { auth },
      props: {
        listId: step.listId,
        email,
        status,
        tags: step.tags,
        mergeFields,
        skipMergeValidation: true,
      },
    })

    await sendFlow({ conversation, flowVersionId, step }, true)
  } catch (error: unknown) {
    const errorDetail = isMailchimpError(error)
      ? error.response?.body || error.data || error
      : error

    logger.error(
      `[Mailchimp] Error for ${conversationId}:`,
      JSON.stringify(errorDetail, null, 2),
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
  const edgesResult = z.array(edgeSchema).safeParse(currentFlow?.edges)

  if (!edgesResult.success) {
    return
  }

  const foundEdge = edgesResult.data.find(
    (e: EdgeSchema) => e.sourceHandle === nodeId,
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
