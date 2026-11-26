import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import {
  getInstagramAccountNode,
  getInstagramGraphClient,
} from "../lib/http-client"
import type {
  InstagramAuthValue,
  InstagramSendMessageRequest,
  InstagramSendMessageResponse,
} from "../schema"

export const sendMessage = (
  auth: InstagramAuthValue,
  payload: InstagramSendMessageRequest,
): Promise<InstagramSendMessageResponse> => {
  const version = auth.metadata.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/${getInstagramAccountNode(auth)}/messages`

  return rescue(endpoint, () =>
    getInstagramGraphClient(auth).post<InstagramSendMessageResponse>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: payload,
      retry: 0,
    }),
  )
}
