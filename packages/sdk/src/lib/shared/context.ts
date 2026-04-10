import type { Readable } from "node:stream"
import { z } from "zod"
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

export type Context<AO extends AuthValue> = {
  storagePrefix: string
  uploader?: ContextUploader
  auth: AO
  queue?: ContextQueue
}

export const contextSchema = z.custom<Context<AuthValue>>(
  (data) =>
    typeof data === "object" &&
    data !== null &&
    "auth" in data &&
    typeof data.auth === "object",
)
