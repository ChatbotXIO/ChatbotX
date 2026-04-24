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

export type Context<AO extends AuthValue, ID = Record<string, unknown>> = {
  storagePrefix: string
  uploader?: ContextUploader
  auth: AO
  queue?: ContextQueue
  integrationDetail?: ID
}
