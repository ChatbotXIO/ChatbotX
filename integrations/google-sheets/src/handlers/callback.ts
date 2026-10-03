import { type HandleRequestProps, SdkException } from "@chatbotx.io/sdk"
import { getClient } from "../client"
import { googleSheetsTokensToAuth } from "../connection-auth"
import { handleError } from "../error"
import type { GoogleSheetsAuthValue, GoogleSheetsConfig } from "../schemas"

export const callbackHandler = async (
  props: HandleRequestProps<GoogleSheetsConfig>,
): Promise<GoogleSheetsAuthValue> => {
  const url = new URL(props.req.url)
  const code = url.searchParams.get("code")
  if (!code) {
    throw new SdkException("Code is required")
  }

  try {
    const client = getClient(props.config)
    const tokens = await client.getToken(code)

    return await googleSheetsTokensToAuth(
      props.config,
      props.config.redirectUrl,
      tokens.tokens,
    )
  } catch (error) {
    return handleError(error)
  }
}
