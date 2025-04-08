import { type ILogObj, Logger } from "tslog"

export const logger = new Logger<ILogObj>({ name: "ahachat.ai" })

export const getLogger = (name: string) => {
  return logger.getSubLogger({ name })
}
