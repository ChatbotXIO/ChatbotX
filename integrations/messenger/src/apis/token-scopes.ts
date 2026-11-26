import { isRateLimited } from "@chatbotx.io/sdk"
import {
  type ScopeReadResult,
  scopesFromDebugToken,
} from "@chatbotx.io/utils/publish-destination"
import { mapToChannelError } from "../lib/error-mapper"
import { debugToken } from "./auth"

/**
 * The permissions the platform reports for a Messenger token: `GET /debug_token`
 * (`scopes`, `is_valid`) inspected with the app access token of the app that
 * minted it (a Page token cannot inspect itself). Never throws: a rate-limit
 * answer and any other failure come back as their own result so the caller can
 * stop or skip without parsing errors. The tokens are only passed to the call.
 * Docs: https://developers.facebook.com/docs/graph-api/reference/debug_token/
 */
export const readTokenScopes = async (input: {
  appAccessToken: string
  inputToken: string
  version?: string
}): Promise<ScopeReadResult> => {
  try {
    return scopesFromDebugToken(await debugToken(input))
  } catch (err) {
    return isRateLimited(mapToChannelError(err))
      ? { kind: "rateLimited" }
      : { kind: "failed" }
  }
}
