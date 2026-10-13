import type { Context } from "@chatbotx.io/sdk"
import { isHTTPError } from "ky"
import { DEFAULT_API_VERSION } from "../constants"
import { MessengerException, rescue } from "../exception"
import { mapToChannelError } from "../lib/error-mapper"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAdsMessage } from "../messenger-ads-json"
import type { MessengerAuthValue } from "../schema"

/**
 * Meta "welcome message flows" for Click-to-Messenger ads:
 * https://developers.facebook.com/documentation/business-messaging/messenger-platform/ads/ads-welcome-message-flows
 *
 * Single attempt (`retry: 0`): the worker job owns retries (see
 * `isTransientWelcomeMessageFlowError`), and a flow attached to an ad
 * deterministically rejects update/delete.
 */
type WelcomeFlowCtx = Pick<Context<MessengerAuthValue>, "auth">

const ELIGIBLE_PLATFORMS = ["messenger"]

const request = (ctx: WelcomeFlowCtx) => {
  const { version = DEFAULT_API_VERSION } = ctx.auth
  return {
    endpoint: `${version}/${ctx.auth.metadata.pageId}/welcome_message_flows`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
    },
  }
}

export const createWelcomeMessageFlow = (props: {
  ctx: WelcomeFlowCtx
  name: string
  messages: MessengerAdsMessage[]
}): Promise<{ flowId: string }> => {
  const { endpoint, headers } = request(props.ctx)
  return rescue(endpoint, async () => {
    const response = await facebookGraphClient.post<{ flow_id: string }>(
      endpoint,
      {
        headers,
        json: {
          name: props.name,
          welcome_message_flow: JSON.stringify(props.messages),
          eligible_platforms: ELIGIBLE_PLATFORMS,
        },
        retry: 0,
      },
    )
    return { flowId: response.flow_id }
  })
}

/** Omit `messages` for a name-only update (flow rename). */
export const updateWelcomeMessageFlow = (props: {
  ctx: WelcomeFlowCtx
  flowId: string
  name: string
  messages?: MessengerAdsMessage[]
}): Promise<void> => {
  const { endpoint, headers } = request(props.ctx)
  return rescue(endpoint, async () => {
    await facebookGraphClient.post(endpoint, {
      headers,
      json: {
        flow_id: props.flowId,
        name: props.name,
        ...(props.messages
          ? {
              welcome_message_flow: JSON.stringify(props.messages),
              eligible_platforms: ELIGIBLE_PLATFORMS,
            }
          : {}),
      },
      retry: 0,
    })
  })
}

export const deleteWelcomeMessageFlow = (props: {
  ctx: WelcomeFlowCtx
  flowId: string
}): Promise<void> => {
  const { endpoint, headers } = request(props.ctx)
  return rescue(endpoint, async () => {
    await facebookGraphClient.delete(endpoint, {
      headers,
      json: { flow_id: props.flowId },
      retry: 0,
    })
  })
}

export type WelcomeMessageFlowState = { id: string; is_used_in_ad: boolean }

/** Graph "object does not exist" (code 100, subcode 33). */
const INVALID_PARAMETER_CODE = 100
const OBJECT_NOT_FOUND_SUBCODE = 33

/**
 * Reads one flow's state; `null` when Meta no longer has it (e.g. deleted in
 * Business Suite). Meta documents no error code for "attached to an ad", so
 * callers check `is_used_in_ad` after a failed update instead.
 */
export const getWelcomeMessageFlow = async (props: {
  ctx: WelcomeFlowCtx
  flowId: string
}): Promise<WelcomeMessageFlowState | null> => {
  const { endpoint, headers } = request(props.ctx)
  try {
    return await rescue(endpoint, async () => {
      // Meta documents neither shape for a single-flow read: accept both.
      const response = await facebookGraphClient.get<
        Partial<WelcomeMessageFlowState> & { data?: WelcomeMessageFlowState[] }
      >(endpoint, {
        headers,
        searchParams: { flow_id: props.flowId },
        retry: 0,
      })
      const flow = response.data ? response.data[0] : response
      return flow?.id
        ? { id: flow.id, is_used_in_ad: flow.is_used_in_ad === true }
        : null
    })
  } catch (error) {
    if (
      error instanceof MessengerException &&
      Number(error.code) === INVALID_PARAMETER_CODE &&
      Number(error.subCode) === OBJECT_NOT_FOUND_SUBCODE
    ) {
      return null
    }
    throw error
  }
}

/**
 * Rate limits, Meta 5xx and requests that never got a response (timeout,
 * network) are worth retrying; anything else (bad content, auth) is not.
 */
export const isTransientWelcomeMessageFlowError = (error: unknown): boolean => {
  const origin =
    error instanceof MessengerException
      ? (error.getOriginError() ?? error)
      : error
  if (!isHTTPError(origin)) {
    return true
  }
  return origin.response.status >= 500 || mapToChannelError(origin).isRetryable
}
