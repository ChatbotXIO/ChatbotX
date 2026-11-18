import { ChatbotXException } from "@chatbotx.io/business/errors"
import { verifyImap } from "@chatbotx.io/integration-smtp/imap"
import { getTranslations } from "next-intl/server"

type ImapLogin = {
  host: string
  port: number
  mailbox: string
  username: string
  password: string
}

/** Throws a translated, user-facing error when the IMAP login or mailbox fails. */
export async function verifyImapLogin(login: ImapLogin): Promise<void> {
  const t = await getTranslations()
  try {
    await verifyImap(
      {
        authType: "custom",
        provider: "other",
        host: "",
        port: 0,
        username: login.username,
        password: login.password,
      },
      { host: login.host, port: login.port, mailbox: login.mailbox },
    )
  } catch {
    throw new ChatbotXException(t("smtp.errors.imapConnectionFailed"))
  }
}
