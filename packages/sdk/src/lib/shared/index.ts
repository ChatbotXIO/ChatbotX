import type { ContextQueue } from "./context"

export * from "./context"
export * from "./message"

export type Handler<I, O> = (props: I) => Promise<O>

export type BaseConfig = Record<string, unknown>

export type HandleRequestProps<IConfig extends BaseConfig> = {
  config: IConfig
  req: Request
  queue?: ContextQueue
}

export const HandleRequestType = {
  CALLBACK: "callback",
  WEBHOOK: "webhook",
  GENERATE_AUTH_URL: "generate-auth-url",
} as const
