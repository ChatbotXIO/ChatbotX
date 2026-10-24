import { ChatbotXException } from "@chatbotx.io/business/errors"
import { smtpHostMap } from "@chatbotx.io/integration-smtp"
import {
  createSmtpTransporter,
  type SmtpTransportOptions,
} from "@chatbotx.io/mail/transport"
import { getTranslations } from "next-intl/server"
import type { CreateSmtpRequest } from "../schema/mutation"

export async function verifySmtpTransport(options: SmtpTransportOptions) {
  const t = await getTranslations()

  const transporter = createSmtpTransporter(options)

  try {
    await transporter.verify()
  } catch {
    throw new ChatbotXException(t("smtp.errors.connectionFailed"))
  } finally {
    transporter.close()
  }
}

export async function verifySmtpConnection(input: CreateSmtpRequest) {
  const { host, port } =
    input.provider === "other"
      ? { host: input.host, port: input.port }
      : smtpHostMap[input.provider]

  await verifySmtpTransport({
    host,
    port,
    username: input.username,
    password: input.password,
  })
}
