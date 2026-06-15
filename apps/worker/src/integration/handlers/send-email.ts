import { emailTopicAnalyticsService } from "@chatbotx.io/analytics"
import {
  buildContext,
  buildUnsubscribeUrl,
  contactService,
  inboxService,
  integrationSmtpService,
  resolveTenantSettings,
  signEmailClickUrl,
  workspaceService,
} from "@chatbotx.io/business"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import type {
  EmailStepSchema,
  PageElementSchema,
} from "@chatbotx.io/flow-config"
import { UNSUBSCRIBE_PLACEHOLDER } from "@chatbotx.io/flow-config"
import {
  integration as integrationSmtp,
  smtpAuthSchema,
} from "@chatbotx.io/integration-smtp"
import type {
  DynamicEmailProps,
  MailElementSchema,
} from "@chatbotx.io/mail/dynamic"
import { renderDynamicEmailHtml } from "@chatbotx.io/mail/dynamic"
import { contactVariableService } from "@chatbotx.io/variables"
import { resolveButtonUrl } from "../../lib/convert-button"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"

async function resolveElements({
  appUrl,
  rawElements,
  variables,
  inbox,
  flowId,
  unsubscribeUrl,
  token,
}: {
  appUrl: string
  rawElements: PageElementSchema[]
  variables: Awaited<ReturnType<typeof contactVariableService.getAll>>
  inbox: InboxWithIntegrations | undefined
  flowId: string | undefined
  unsubscribeUrl: string
  token?: string
}): Promise<MailElementSchema[]> {
  const resolved: MailElementSchema[] = []

  for (const el of rawElements) {
    switch (el.type) {
      case "heading":
      case "text":
      case "code": {
        const resolvedText = await contactVariableService.replaceAll({
          text: el.text,
          variables,
        })
        resolved.push({
          type: el.type,
          text: resolvedText.replaceAll(
            UNSUBSCRIBE_PLACEHOLDER,
            unsubscribeUrl,
          ),
        })
        break
      }
      case "image":
        resolved.push({
          type: "image",
          url: el.url,
        })
        break
      case "line":
      case "spacing":
        resolved.push({ type: el.type })
        break
      case "button": {
        let url = el.buttonType
          ? resolveButtonUrl({
              appUrl,
              button: el,
              inbox,
              flowId,
            })
          : undefined

        if (url && token) {
          // Seal the destination into an authenticated token so the click
          // route cannot be abused as an open redirect (the raw URL is never
          // trusted from the query string). base64url is URL-safe.
          const signedUrl = await signEmailClickUrl(url)
          url = `${appUrl}/email-topic/click?r=${token}&u=${signedUrl}`
        }

        resolved.push({ type: "button", url, label: el.label })
        break
      }
      default:
        break
    }
  }

  if (token) {
    resolved.push({
      type: "image",
      url: `${appUrl}/email-topic/open?r=${token}`,
    })
  }

  return resolved
}

export async function sendEmail({
  conversation,
  flowVersion,
  step,
  contactInbox,
  metadata: _metadata,
}: ExecuteStepProps<EmailStepSchema>) {
  const contact = await contactService.findBy({
    where: { id: conversation.contactId },
  })
  if (!contact?.emailOptIn) {
    logger.info(
      { contactId: conversation.contactId },
      "handleSendEmail: contact has opted out of email, skipping",
    )
    return
  }

  const smtpIntegration = await integrationSmtpService.find({
    where: {
      workspaceId: conversation.workspaceId,
      id: step.integrationSmtpId,
    },
  })
  if (!smtpIntegration) {
    logger.warn(
      `handleSendEmail: smtp integration ${step.integrationSmtpId} not found`,
    )
    return
  }

  const auth = smtpAuthSchema.parse({
    authType: "custom",
    ...(smtpIntegration.auth as Record<string, unknown>),
  })

  const workspace = await workspaceService.findById({
    id: conversation.workspaceId,
  })

  const inbox = await inboxService.find({
    where: {
      id: contactInbox.inboxId,
      workspaceId: conversation.workspaceId,
    },
  })

  const variables = await contactVariableService.getAll(conversation.contactId)
  const { appUrl } = await resolveTenantSettings({
    workspaceId: conversation.workspaceId,
  })

  const [to, subject, preheader] = await Promise.all([
    contactVariableService.replaceAll({ text: step.to, variables }),
    contactVariableService.replaceAll({ text: step.subject, variables }),
    contactVariableService.replaceAll({ text: step.preheader, variables }),
  ])

  const unsubscribeUrl = await buildUnsubscribeUrl(
    appUrl,
    conversation.contactId,
    conversation.workspaceId,
  )

  // Create per-recipient tracking row before building URLs so the token is available.
  let token: string | undefined
  if (step.topicId) {
    const result = await emailTopicAnalyticsService.createRecipient({
      topicId: step.topicId,
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      email: to,
    })
    token = result.token
  }

  const elements = await resolveElements({
    appUrl,
    rawElements: step.elements,
    variables,
    inbox,
    flowId: flowVersion.flowId,
    unsubscribeUrl,
    token,
  })

  const props: DynamicEmailProps = {
    brandName: workspace.name ?? smtpIntegration.name,
    subject,
    preheader,
    elements,
  }

  const botContext = await buildContext({
    workspaceId: workspace.id,
    integrationType: "smtp",
    integration: { ...smtpIntegration, auth },
  })

  try {
    await integrationSmtp.runAction("sendMail", {
      ctx: botContext,
      from: step.from || smtpIntegration.fromAddress,
      to,
      subject,
      html: await renderDynamicEmailHtml(props),
    })

    if (token) {
      await emailTopicAnalyticsService.markDelivered(token)
    }
  } catch {
    logger.error(
      {
        integrationSmtpId: smtpIntegration.id,
        workspaceId: conversation.workspaceId,
      },
      "handleSendEmail: SMTP send failed",
    )
    if (token) {
      await emailTopicAnalyticsService.markFailed(token)
    }
    return
  }
}
