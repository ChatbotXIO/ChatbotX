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
  type AccountCredentialsProps,
  buildAccountCredentialsMjml,
  DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
} from "./emails/sign-up-credentials"
import {
  buildSignUpVerificationMjml,
  type SignUpVerificationProps,
} from "./emails/sign-up-verification"
import { keys } from "./keys"
import { createSmtpTransporter, type SmtpTransportOptions } from "./transport"

export type EmailTemplate = { subject?: string; body?: string }
export {
  DEFAULT_FORGOT_PASSWORD_SUBJECT,
  DEFAULT_FORGOT_PASSWORD_TEMPLATE,
  DEFAULT_MAGIC_LINK_SUBJECT,
  DEFAULT_MAGIC_LINK_TEMPLATE,
  DEFAULT_SIGNUP_SUBJECT,
  DEFAULT_SIGNUP_TEMPLATE,
} from "./emails/default-templates"
export { DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT } from "./emails/sign-up-credentials"

function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => esc(vars[key] ?? ""))
}

async function renderCustomTemplate(
  body: string,
  vars: Record<string, string>,
): Promise<string> {
  const substituted = substituteVars(body, vars)
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

type SendMailOptions = {
  from?: string
  transport?: SmtpTransportOptions
}

function formatFrom(options?: {
  fromEmail?: string
  fromName?: string
}): string | undefined {
  if (!options?.fromEmail) {
    return
  }
  if (!options.fromName) {
    return options.fromEmail
  }
  // Strip control chars (incl. CR/LF) before interpolating into the From header
  // to prevent SMTP header injection via a reseller-controlled display name,
  // then escape quotes for the quoted-string form.
  const safeName = options.fromName
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping CR/LF/controls is the intent
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/"/g, '\\"')
  return `"${safeName}" <${options.fromEmail}>`
}

async function sendMail(
  email: string,
  subject: string,
  html: string,
  options?: SendMailOptions,
) {
  const mailTransporter = options?.transport
    ? createSmtpTransporter(options.transport)
    : transporter

  await mailTransporter.sendMail({
    from: options?.from ?? env.SMTP_FROM,
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
  options?: SendMailOptions,
): Promise<void> {
  const customBody = customTemplate?.body?.trim()
  const customSubject = customBody && customTemplate?.subject?.trim()
  const subject = substituteVars(customSubject ?? defaultSubject, templateVars)
  const body = customBody ?? (await buildDefaultHtml())
  const html = await renderCustomTemplate(body, templateVars)
  await sendMail(email, subject, html, options)
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

export const sendAccountCredentials = async (
  email: string,
  props: AccountCredentialsProps & {
    customTemplate?: EmailTemplate | null
  },
  transport: SmtpTransportOptions & { fromEmail: string; fromName?: string },
) => {
  const { customTemplate, ...templateProps } = props
  await sendEmailWithTemplate(
    email,
    props.subject || DEFAULT_ACCOUNT_CREDENTIALS_SUBJECT,
    customTemplate,
    () => compileMjml(buildAccountCredentialsMjml(templateProps)),
    {
      userName: templateProps.userName,
      loginEmail: templateProps.loginEmail,
      initialPassword: templateProps.initialPassword,
      signInUrl: templateProps.signInUrl,
      brandName: templateProps.brandName,
      brandLogoUrl: templateProps.brandLogoUrl,
      brandUrl: templateProps.brandUrl,
    },
    {
      from: formatFrom(transport),
      transport,
    },
  )
}
