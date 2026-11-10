import { buttonTypes, stepTypes } from "@chatbotx.io/flow-config"
import { type MessageHandlers, SdkException } from "@chatbotx.io/sdk"
import type { SmtpAuthValue } from "../../schema"
import { buildReplySubject } from "./email-headers"
import { deliverMail, readFromAddress } from "./send-message"

export const handledFlowStepTypes = [stepTypes.enum.sendText] as const

export const sendFlowStep: MessageHandlers<SmtpAuthValue>["sendFlowStep"] =
  async (props) => {
    const {
      ctx,
      data: { step, contact, quickReplies },
    } = props

    if (step.stepType !== stepTypes.enum.sendText) {
      throw new SdkException(
        `SMTP channel does not support flow step "${step.stepType}"`,
      )
    }

    const fromAddress = readFromAddress(ctx.integrationDetail)
    if (!fromAddress) {
      throw new SdkException("SMTP inbox has no from address configured")
    }
    if (!contact.sourceId.includes("@")) {
      throw new SdkException("Contact has no email address to send to")
    }

    // Email has no interactive buttons: only website buttons survive, as links.
    const links = [
      ...step.buttons.flatMap((button) =>
        button.buttonType === buttonTypes.enum.openWebsite
          ? [`${button.label}: ${button.beforeStep.url}`]
          : [],
      ),
      ...(quickReplies ?? []).flatMap((button) =>
        button.buttonType === "url" ? [`${button.label}: ${button.url}`] : [],
      ),
    ]
    const text = [step.text, ...links].filter(Boolean).join("\n\n")

    const messageId = await deliverMail({
      auth: ctx.auth,
      fromAddress,
      mail: {
        to: contact.sourceId,
        subject: buildReplySubject(undefined),
        text,
      },
    })

    return { messageIds: [messageId], sentCount: 1 }
  }
