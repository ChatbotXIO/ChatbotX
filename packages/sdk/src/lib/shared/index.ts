import type { ContextQueue } from "./context"

export * from "./context"
export * from "./message"
export * from "./mime-types"

export type Handler<I, O> = (props: I) => Promise<O>

export type BaseConfig = Record<string, unknown>

export type HandleRequestProps<IConfig extends BaseConfig> = {
  config: IConfig
  req: Request
  queue?: ContextQueue
}

export const HandleRequestType = {
  callback: "callback",
  webhook: "webhook",
  generateAuthUrl: "generate-auth-url",
} as const
