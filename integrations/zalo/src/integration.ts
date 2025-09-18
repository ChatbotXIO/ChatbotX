import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { callbackHandler } from "./handlers/callback"
import type { ZaloActions, ZaloAuthValue, ZaloConfig } from "./schemas"

const config: IntegrationDefinition<ZaloConfig, ZaloAuthValue, ZaloActions> = {
  name: "zalo",
  actions: {},
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const method = segments.pop()

    switch (method) {
      case HandleRequestType.CALLBACK:
        return await callbackHandler(props)
      default:
        throw new SdkException(
          `Handler: ${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: (_props: ZaloAuthValue): Promise<void> => {
    throw new Error("Function not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<ZaloConfig, ZaloAuthValue, ZaloActions>
>(config)
