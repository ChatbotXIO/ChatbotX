import type { Context } from "@chatbotx.io/sdk"
import nodemailer from "nodemailer"
import type { SmtpAuthValue } from "./schema"

export const sendMail = async (props: {
  from: string
  to: string
  subject: string
  html: string
  ctx: Context<SmtpAuthValue>
}): Promise<void> => {
  const { ctx, ...mailOptions } = props
  const { auth } = ctx

  const transporter = nodemailer.createTransport({
    host: auth.host,
    port: auth.port,
    secure: auth.port === 465,
    auth: { user: auth.username, pass: auth.password },
  })

  await transporter.sendMail(mailOptions)
}
