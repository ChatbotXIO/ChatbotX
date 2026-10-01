import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { MessengerException, rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAuthValue } from "../schema"

/** Meta caps the free-form handover `metadata` at 2000 characters. */
export const THREAD_CONTROL_METADATA_MAX_LENGTH = 2000

export type MessengerThreadControlBody = {
  recipient: { id: string }
  /** `pass_thread_control` only: the app the thread is handed to. */
  target_app_id?: string
  metadata?: string
}

type ThreadControlResponse = { success?: boolean }

const post = (
  auth: MessengerAuthValue,
  edge: "take_thread_control" | "pass_thread_control",
  body: MessengerThreadControlBody,
): Promise<ThreadControlResponse> => {
  const { version = DEFAULT_API_VERSION } = auth
  const endpoint = `${version}/me/${edge}`

  return rescue(endpoint, () =>
    facebookGraphClient.post<ThreadControlResponse>(endpoint, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.tokens.accessToken}`,
      },
      json: body,
      // A repeated take/pass is not harmful, but a Meta rejection is a final
      // answer: never retried here.
      retry: 0,
    }),
  )
}

const clipMetadata = (metadata: string | undefined): { metadata?: string } =>
  metadata
    ? { metadata: metadata.slice(0, THREAD_CONTROL_METADATA_MAX_LENGTH) }
    : {}

/**
 * `POST /me/take_thread_control` — the primary receiver takes the thread back
 * from the app that holds it.
 *
 * Reference: https://developers.facebook.com/docs/messenger-platform/handover-protocol/take-thread-control
 */
export const takeThreadControl = (
  auth: MessengerAuthValue,
  input: { psid: string; metadata?: string },
): Promise<ThreadControlResponse> =>
  post(auth, "take_thread_control", {
    recipient: { id: input.psid },
    ...clipMetadata(input.metadata),
  })

/**
 * `POST /me/pass_thread_control` — hand the thread to `targetAppId`.
 *
 * Reference: https://developers.facebook.com/docs/messenger-platform/handover-protocol/pass-thread-control
 */
export const passThreadControl = (
  auth: MessengerAuthValue,
  input: { psid: string; targetAppId: string; metadata?: string },
): Promise<ThreadControlResponse> =>
  post(auth, "pass_thread_control", {
    recipient: { id: input.psid },
    target_app_id: input.targetAppId,
    ...clipMetadata(input.metadata),
  })

/**
 * Meta answers `thread_owner` with either a numeric or a string app id. `data`
 * is required: a 200 body without it is malformed (e.g. an error envelope), not
 * an empty-owner answer — a validated empty answer is `data: []` or an item with
 * no `thread_owner`.
 */
const threadOwnerResponseSchema = z.object({
  data: z.array(
    z.object({
      thread_owner: z
        .object({
          app_id: z.union([z.string(), z.number()]).nullish(),
          expiration: z.union([z.string(), z.number()]).nullish(),
        })
        .nullish(),
    }),
  ),
})

export type MessengerThreadOwner = {
  ownerAppId: string | null
  expiresAt: Date | null
}

const DIGITS_ONLY = /^\d+$/

const parseExpiration = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return null
  }
  // Meta sends either epoch seconds or an ISO/RFC date string.
  const date =
    typeof value === "number" || DIGITS_ONLY.test(value)
      ? new Date(Number(value) * 1000)
      : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * `GET /me/thread_owner?recipient={PSID}` — the app that holds the thread now.
 * A validated empty answer (nobody holds it) yields a `null` owner; a malformed
 * body THROWS (the answer is unavailable, not "no owner") so a reconcile never
 * clears a known owner off an unparseable response.
 *
 * Reference: https://developers.facebook.com/docs/messenger-platform/handover-protocol/get-thread-owner
 */
export const getThreadOwner = async (
  auth: MessengerAuthValue,
  input: { psid: string },
): Promise<MessengerThreadOwner> => {
  const { version = DEFAULT_API_VERSION } = auth
  const endpoint = `${version}/me/thread_owner`

  const response: unknown = await rescue(endpoint, () =>
    facebookGraphClient.get<unknown>(endpoint, {
      headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
      searchParams: { recipient: input.psid },
    }),
  )

  const parsed = threadOwnerResponseSchema.safeParse(response)
  if (!parsed.success) {
    throw new MessengerException("Malformed thread_owner response")
  }
  const owner = parsed.data.data[0]?.thread_owner
  const appId = owner?.app_id
  if (appId === null || appId === undefined || String(appId) === "") {
    return { ownerAppId: null, expiresAt: null }
  }
  return {
    ownerAppId: String(appId),
    expiresAt: parseExpiration(owner?.expiration),
  }
}
