import type { Readable } from "node:stream"
import type { AuthValue } from "../auth"

export type ContextUploader = {
  putObject(
    newPath: string,
    body: string | Readable | Buffer<ArrayBufferLike>,
    options?: unknown,
    // biome-ignore lint/suspicious/noExplicitAny: wip
  ): Promise<any>
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

export type Context<AO extends AuthValue, ID = Record<string, unknown>> = {
  storagePrefix: string
  uploader?: ContextUploader
  auth: AO
  authStore?: AuthStore<AO>
  queue?: ContextQueue
  integrationDetail?: ID
  platform: {
    appUrl: string
    realtimeUrl: string
    realtimeApiKey: string
  }
}
