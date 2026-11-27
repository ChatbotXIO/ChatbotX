import type { Readable } from "node:stream"
import type { RealtimeGuestEventData } from "@chatbotx.io/realtime-protocol"
import type { AuthValue } from "../auth"

export type ContextUploader = {
  putObject(
    newPath: string,
    body: string | Readable | Buffer<ArrayBufferLike>,
    options?: unknown,
    abortSignal?: AbortSignal,
    // biome-ignore lint/suspicious/noExplicitAny: wip
  ): Promise<any>
  /** Reads an object by key straight from the bucket. */
  getObjectStream?(
    path: string,
  ): Promise<{ stream: AsyncIterable<Uint8Array>; contentLength?: number }>
}

export type ContextQueue = {
  // biome-ignore lint/suspicious/noExplicitAny: wip
  add(name: string, payload: any, opts?: any): Promise<any>
}

export type AuthStore<AO extends AuthValue = AuthValue> = {
  load: () => Promise<AO>
  save: (auth: AO) => Promise<void>
  /**
   * Optional cross-process serialization for the load→refresh→save sequence
   * (e.g. a Redis lock). Implementations should re-run `fn` exclusively per
   * auth identity to prevent duplicate refresh round-trips.
   */
  withLock?: <T>(fn: () => Promise<T>) => Promise<T>
  /**
   * Called by the SDK when auth refresh has terminally failed. Implementations
   * typically flip the integration's connection state (e.g. `Inbox.status =
   * "disconnected"`) so the UI can prompt the user to reconnect. Errors thrown
   * here are swallowed by the SDK so they don't shadow the underlying refresh
   * failure.
   */
  markOffline?: (reason?: unknown) => Promise<void>
}

/**
 * Short-lived key/value store scoped to one integration. For single-use
 * secrets that must cross a process boundary within seconds (e.g. a reply
 * token stashed at receive time and taken at send time). `take` is atomic:
 * only one caller gets the value.
 */
export type ContextEphemeralStore = {
  put(key: string, value: string, ttlSeconds: number): Promise<void>
  take(key: string): Promise<string | null>
}

export type Context<AO extends AuthValue, ID = Record<string, unknown>> = {
  storagePrefix: string
  /**
   * Channel-scoped prefix for media received from the channel. Read it through
   * `getMediaStoragePrefix`, which falls back to `storagePrefix` for contexts
   * built without a channel.
   */
  mediaStoragePrefix?: string
  uploader?: ContextUploader
  auth: AO
  authStore?: AuthStore<AO>
  queue?: ContextQueue
  ephemeral?: ContextEphemeralStore
  integrationDetail?: ID
  platform: {
    appUrl: string
    publicRealtimeUrl: string
    storageUrl: string
    /**
     * Publishes a guest-scoped event through the platform's durable realtime
     * transport. The integration never receives a deployment-internal URL or
     * signing secret.
     */
    publishGuestRealtimeEvent: (
      guestConversationId: string,
      event: RealtimeGuestEventData,
    ) => Promise<void>
  }
}

export const getMediaStoragePrefix = (
  ctx: Pick<Context<AuthValue>, "storagePrefix" | "mediaStoragePrefix">,
): string => ctx.mediaStoragePrefix ?? ctx.storagePrefix
