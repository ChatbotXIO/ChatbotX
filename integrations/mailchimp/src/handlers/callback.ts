import { type HandleRequestProps, SdkException } from "@aha.chat/sdk"
import { exchangeCode } from "../client"
import type { MailchimpAuthValue, MailchimpConfig } from "../schemas"

export const callbackHandler = async ({
  config,
  req,
}: HandleRequestProps<MailchimpConfig>): Promise<MailchimpAuthValue> => {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")

  if (!code) {
    throw new SdkException("Mailchimp callback missing code")
  }

  return await exchangeCode(config, code)
}
