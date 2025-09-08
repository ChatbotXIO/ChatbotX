import { AuthType, type HandleRequestProps, SdkException } from "@aha.chat/sdk"
import { convertCodeToAccessToken, scope } from "../client"
import type { MessengerAuthValue, MessengerConfig } from "../schemas"

export const callbackHandler = async (
  props: HandleRequestProps<MessengerConfig>,
): Promise<MessengerAuthValue> => {
  const url = new URL(props.req.url)
  const code = url.searchParams.get("code")

  if (!code) {
    throw new SdkException("Code is required")
  }

  const accessToken = await convertCodeToAccessToken(code, props.config)

  return {
    authType: AuthType.OAUTH2,
    clientId: props.config.clientId,
    clientSecret: props.config.clientSecret as string,
    redirectUri: props.config.redirectUri,
    version: props.config.version,
    tokens: {
      accessToken: accessToken || "",
    },
    metadata: {
      scope,
    },
  }
}
