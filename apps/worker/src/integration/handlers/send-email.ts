import { emailTopicAnalyticsService } from "@chatbotx.io/analytics"
import {
  buildContext,
  buildUnsubscribeUrl,
  contactService,
  emailTrackingService,
  inboxService,
  integrationSmtpService,
  resolveTenantSettings,
  signEmailClickUrl,
  workspaceService,
} from "@chatbotx.io/business"
import { awardLeaderboardEmailEngagement } from "@chatbotx.io/business/leaderboard"
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
import type { IntegrationJobRecordEmailTrackingTransition } from "@chatbotx.io/worker-config"
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
  workspaceId,
}: {
  appUrl: string
  rawElements: PageElementSchema[]
  variables: Awaited<ReturnType<typeof contactVariableService.getAll>>
  inbox: InboxWithIntegrations | undefined
  flowId: string | undefined
  unsubscribeUrl: string
  token?: string
  workspaceId: string
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
          const signedUrl = await signEmailClickUrl(url, workspaceId)
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

  const variables = await contactVariableService.getAll({
    contactId: conversation.contactId,
    contactInbox,
    conversation,
    workspace,
  })
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

  // Create the per-recipient tracking row (and record "sent") before building
  // URLs so the token is available. Every email gets one: a topic only groups
  // statistics, while an email without a topic is the "No Topic" bucket.
  const { token } = await emailTrackingService.createRecipient({
    // The editor stores "no topic" as an empty string.
    topicId: step.topicId || undefined,
    workspaceId: conversation.workspaceId,
    contactId: conversation.contactId,
    conversationId: conversation.id,
    contactInboxId: contactInbox.id,
    email: to,
  })

  const elements = await resolveElements({
    appUrl,
    rawElements: step.elements,
    variables,
    inbox,
    flowId: flowVersion.flowId,
    unsubscribeUrl,
    token,
    workspaceId: conversation.workspaceId,
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
  } catch {
    logger.error(
      {
        integrationSmtpId: smtpIntegration.id,
        workspaceId: conversation.workspaceId,
      },
      "handleSendEmail: SMTP send failed",
    )
    await emailTopicAnalyticsService.markFailed(token)
    return
  }

  // The mail is already accepted: a tracking failure must neither mark the
  // send failed nor retry the SMTP call, so it is handed to the repair job.
  await emailTrackingService.recordTransitionOrEnqueueRepair({
    phase: "delivered",
    token,
    workspaceId: conversation.workspaceId,
  })
}

/**
 * Repair job: retries only the post-send tracking transaction, never SMTP. An
 * open/click that failed in its route also missed the leaderboard award (it
 * reads the first-event time the failed transaction never wrote), so it is
 * awarded here once the transition has landed. The award is idempotent and
 * best-effort: it must not throw, because a retry of this job would re-run the
 * transition and count the hit's raw counters a second time.
 */
export async function recordEmailTrackingTransition(
  data: IntegrationJobRecordEmailTrackingTransition["data"],
): Promise<void> {
  await emailTrackingService.recordTransition({
    phase: data.phase,
    token: data.token,
  })

  if (data.phase === "opened" || data.phase === "clicked") {
    await awardLeaderboardEmailEngagement({
      kind: data.phase === "opened" ? "open" : "click",
      link: data.link,
      token: data.token,
    }).catch((err) =>
      logger.error(
        { err, phase: data.phase },
        "email-tracking repair: leaderboard award failed",
      ),
    )
  }
}
