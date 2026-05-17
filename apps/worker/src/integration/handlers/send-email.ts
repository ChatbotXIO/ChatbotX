import {
  buildContext,
  inboxService,
  integrationSmtpService,
  resolvePlatformUrls,
  workspaceService,
} from "@chatbotx.io/business"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import type {
  EmailStepSchema,
  PageElementSchema,
} from "@chatbotx.io/flow-config"
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
}: {
  appUrl: string
  rawElements: PageElementSchema[]
  variables: Awaited<ReturnType<typeof contactVariableService.getAll>>
  inbox: InboxWithIntegrations | undefined
  flowId: string | undefined
}): Promise<MailElementSchema[]> {
  const resolved: MailElementSchema[] = []

  for (const el of rawElements) {
    switch (el.type) {
      case "heading":
      case "text":
      case "code":
        resolved.push({
          type: el.type,
          text: await contactVariableService.replaceAll({
            text: el.text,
            variables,
          }),
        })
        break
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
        const url = el.buttonType
          ? resolveButtonUrl({
              appUrl,
              button: el,
              inbox,
              flowId,
            })
          : undefined

        resolved.push({ type: "button", url, label: el.label })
        break
      }
      default:
        break
    }
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

  const workspace = await workspaceService.findById(conversation.workspaceId)

  const inbox = await inboxService.find({
    where: {
      id: contactInbox.inboxId,
      workspaceId: conversation.workspaceId,
    },
  })

  const variables = await contactVariableService.getAll(conversation.contactId)
  const { appUrl } = await resolvePlatformUrls({
    workspaceId: conversation.workspaceId,
  })

  const [to, subject, preheader] = await Promise.all([
    contactVariableService.replaceAll({ text: step.to, variables }),
    contactVariableService.replaceAll({ text: step.subject, variables }),
    contactVariableService.replaceAll({ text: step.preheader, variables }),
  ])

  const elements = await resolveElements({
    appUrl,
    rawElements: step.elements,
    variables,
    inbox,
    flowId: flowVersion.flowId,
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
      from: step.from || auth.fromAddress,
      to,
      subject,
      html: await renderDynamicEmailHtml(props),
    })
  } catch {
    logger.error(
      {
        integrationSmtpId: smtpIntegration.id,
        workspaceId: conversation.workspaceId,
      },
      "handleSendEmail: SMTP send failed",
    )
    return
  }
}
