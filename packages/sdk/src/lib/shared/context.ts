import type { Readable } from "node:stream"
import type { ILogObj, Logger } from "tslog"
import { z } from "zod"
import type { BaseAuthValue } from "../auth"

export interface ContextUploader {
  putObject(
    newPath: string,
    body: string | Readable | Buffer<ArrayBufferLike>,
    options?: unknown,
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  ): Promise<any>
}

export interface ContextQueue {
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  add(name: string, payload: any, opts?: any): Promise<any>
}

export interface ChatbotEntity {
  id: string
}

export type Context<AO extends BaseAuthValue> = {
  chatbot?: ChatbotEntity
  uploader?: ContextUploader
  auth: AO
  logger: Logger<ILogObj>
  queue?: ContextQueue
}

export const contextSchema = z.custom<Context<BaseAuthValue>>((data) => {
  return (
    typeof data === "object" &&
    data !== null &&
    "auth" in data &&
    typeof data.auth === "object"
  )
})
