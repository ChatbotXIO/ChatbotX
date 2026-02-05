import pino from "pino"

const baseLogger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
  level: process.env.LOG_LEVEL || "info",
})

export const getChildLogger = (name: string) => {
  return baseLogger.child({ module: name })
}

export default baseLogger
