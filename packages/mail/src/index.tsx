import { render } from "@react-email/components"
import nodemailer from "nodemailer"
import type { ResetPasswordProps } from "./emails/reset-password"
import ResetPassword from "./emails/reset-password"
import type { SignInMagicLinkProps } from "./emails/sign-in-magic-link"
import SignInMagicLink from "./emails/sign-in-magic-link"
import SignUpVerification, {
  type SignUpVerificationProps,
} from "./emails/sign-up-verification"
import { keys } from "./keys"

const env = keys()
const transporter = nodemailer.createTransport(env.SMTP_SERVER)

async function sendMail(email: string, subject: string, html: string) {
  await transporter.sendMail({
    from: env.NEXT_PUBLIC_SMTP_FROM,
    to: email,
    subject,
    html,
  })
}

export const sendMagicLink = async (
  email: string,
  props: SignInMagicLinkProps,
) => {
  const html = await render(<SignInMagicLink {...props} />)
  await sendMail(email, props.subject, html)
}

export const sendSignUpVerification = async (
  email: string,
  props: SignUpVerificationProps,
) => {
  const html = await render(<SignUpVerification {...props} />)
  await sendMail(email, props.subject, html)
}

export const sendResetPassword = async (
  email: string,
  props: ResetPasswordProps,
) => {
  const html = await render(<ResetPassword {...props} />)
  await sendMail(email, props.subject, html)
}
