import { integrationSmtpService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { smtpHostMap } from "@chatbotx.io/integration-smtp"
import { createSmtpTransporter } from "@chatbotx.io/mail/transport"
import { getTranslations } from "next-intl/server"
import type { CreateSmtpRequest, UpdateSmtpRequest } from "../schema/mutation"

export async function verifySmtpConnection(input: CreateSmtpRequest) {
  const t = await getTranslations()

  const { host, port } =
    input.provider === "other"
      ? { host: input.host, port: input.port }
      : smtpHostMap[input.provider]

  const transporter = createSmtpTransporter({
    host,
    port,
    username: input.username,
    password: input.password,
  })

  try {
    await transporter.verify()
  } catch {
    throw new ChatbotXException(t("smtp.errors.connectionFailed"))
  } finally {
    transporter.close()
  }
}

const resolveHostAndPort = (input: {
  provider: CreateSmtpRequest["provider"]
  host: string
  port: number
}) => {
  if (input.provider !== "other") {
    return smtpHostMap[input.provider]
  }
  return { host: input.host, port: input.port }
}

export async function createSmtp(
  workspaceId: string,
  input: CreateSmtpRequest,
) {
  await verifySmtpConnection(input)
  const { host, port } = resolveHostAndPort(input)
  return await integrationSmtpService.create(workspaceId, {
    ...input,
    host,
    port,
  })
}

export async function updateSmtp(
  workspaceId: string,
  id: string,
  input: UpdateSmtpRequest,
) {
  await verifySmtpConnection(input)
  const { host, port } = resolveHostAndPort(input)
  return await integrationSmtpService.update(workspaceId, id, {
    ...input,
    host,
    port,
  })
}

export async function deleteSmtp(workspaceId: string, id: string) {
  await integrationSmtpService.delete(workspaceId, id)
}
