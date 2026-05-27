import mjml2html from "mjml"
import { esc } from "./emails/base-template"
import {
  buildResetPasswordMjml,
  type ResetPasswordProps,
} from "./emails/reset-password"
import {
  buildSignInMagicLinkMjml,
  type SignInMagicLinkProps,
} from "./emails/sign-in-magic-link"
import {
  buildSignUpVerificationMjml,
  type SignUpVerificationProps,
} from "./emails/sign-up-verification"
import { keys } from "./keys"
import { createSmtpTransporter } from "./transport"

export type EmailTemplate = { subject?: string; body?: string }
export {
  DEFAULT_FORGOT_PASSWORD_SUBJECT,
  DEFAULT_FORGOT_PASSWORD_TEMPLATE,
  DEFAULT_MAGIC_LINK_SUBJECT,
  DEFAULT_MAGIC_LINK_TEMPLATE,
  DEFAULT_SIGNUP_SUBJECT,
  DEFAULT_SIGNUP_TEMPLATE,
} from "./emails/default-templates"

async function renderCustomTemplate(
  body: string,
  vars: Record<string, string>,
): Promise<string> {
  const substituted = body.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    esc(vars[key] ?? ""),
  )
  if (substituted.trimStart().startsWith("<mjml")) {
    return await compileMjml(substituted)
  }
  return substituted
}

async function compileMjml(mjmlString: string): Promise<string> {
  const { html, errors } = await mjml2html(mjmlString, {
    validationLevel: "soft",
  })
  if (errors.length > 0) {
    throw new Error(
      `mjml render error: ${errors.map((e: { formattedMessage: string }) => e.formattedMessage).join(", ")}`,
    )
  }
  return html
}

const env = keys()
const transporter = createSmtpTransporter()

async function sendMail(email: string, subject: string, html: string) {
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject,
    html,
  })
}

async function sendEmailWithTemplate(
  email: string,
  defaultSubject: string,
  customTemplate: EmailTemplate | null | undefined,
  buildDefaultHtml: () => Promise<string>,
  templateVars: Record<string, string>,
): Promise<void> {
  const customBody = customTemplate?.body?.trim()
  const subject =
    (customBody && customTemplate?.subject?.trim()) || defaultSubject
  const html = customBody
    ? await renderCustomTemplate(customBody, templateVars)
    : await buildDefaultHtml()
  await sendMail(email, subject, html)
}

export const sendMagicLink = async (
  email: string,
  props: SignInMagicLinkProps & { customTemplate?: EmailTemplate | null },
) => {
  const { customTemplate, ...templateProps } = props
  await sendEmailWithTemplate(
    email,
    props.subject,
    customTemplate,
    () => compileMjml(buildSignInMagicLinkMjml(templateProps)),
    {
      userName: templateProps.userName,
      magicUrl: templateProps.magicUrl,
      brandName: templateProps.brandName,
      brandLogoUrl: templateProps.brandLogoUrl,
      brandUrl: templateProps.brandUrl,
    },
  )
}

export const sendSignUpVerification = async (
  email: string,
  props: SignUpVerificationProps & { customTemplate?: EmailTemplate | null },
) => {
  const { customTemplate, ...templateProps } = props
  await sendEmailWithTemplate(
    email,
    props.subject,
    customTemplate,
    () => compileMjml(buildSignUpVerificationMjml(templateProps)),
    {
      userName: templateProps.userName,
      verificationUrl: templateProps.verificationUrl,
      brandName: templateProps.brandName,
      brandLogoUrl: templateProps.brandLogoUrl,
      brandUrl: templateProps.brandUrl,
    },
  )
}

export const sendResetPassword = async (
  email: string,
  props: ResetPasswordProps & { customTemplate?: EmailTemplate | null },
) => {
  const { customTemplate, ...templateProps } = props
  await sendEmailWithTemplate(
    email,
    props.subject,
    customTemplate,
    () => compileMjml(buildResetPasswordMjml(templateProps)),
    {
      userName: templateProps.userName,
      resetPasswordUrl: templateProps.resetPasswordUrl,
      brandName: templateProps.brandName,
      brandLogoUrl: templateProps.brandLogoUrl,
      brandUrl: templateProps.brandUrl,
    },
  )
}
