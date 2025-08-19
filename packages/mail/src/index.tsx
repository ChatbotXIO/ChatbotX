import { render } from "@react-email/components"
import nodemailer from "nodemailer"
import {
  LoginMagicLinkEmail,
  type LoginMagicLinkEmailProps,
} from "./emails/login-magic-link"
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

export async function sendMagicLinkMail(
  email: string,
  props: LoginMagicLinkEmailProps,
) {
  const html = await render(<LoginMagicLinkEmail {...props} />)
  await sendMail(email, "Magic link request", html)
}
