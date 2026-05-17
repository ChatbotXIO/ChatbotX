import { createRequire } from "node:module"
import type { MJMLParseResults } from "mjml-core"
import type nodemailer from "nodemailer"
import {
  buildMjmlTemplate,
  type DynamicEmailProps,
} from "./emails/dynamic-template"
import { keys } from "./keys"
import { createSmtpTransporter } from "./transport"

const _require = createRequire(import.meta.url)
const mjml2html = _require("mjml") as (
  template: string,
  options?: { validationLevel?: string },
) => Promise<MJMLParseResults>

export type {
  DynamicEmailProps,
  MailElementSchema,
} from "./emails/dynamic-template"

export async function renderDynamicEmailHtml(
  props: DynamicEmailProps,
): Promise<string> {
  const { html, errors } = await mjml2html(buildMjmlTemplate(props), {
    validationLevel: "soft",
  })

  if (errors.length > 0) {
    throw new Error(
      `mjml render error: ${errors.map((e) => e.formattedMessage).join(", ")}`,
    )
  }

  return html
}

export const sendDynamicEmail = async (
  email: string,
  props: DynamicEmailProps,
  options?: { from?: string; transporter?: nodemailer.Transporter },
) => {
  const env = keys()
  const html = await renderDynamicEmailHtml(props)
  const transporter = options?.transporter ?? createSmtpTransporter()
  await transporter.sendMail({
    from: options?.from ?? env.NEXT_PUBLIC_SMTP_FROM,
    to: email,
    subject: props.subject,
    html,
  })
}
