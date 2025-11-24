import baseLogger from "@aha.chat/logger"

export const logger = baseLogger.getSubLogger({
  name: "worker",
})

export const aiLogger = baseLogger.getSubLogger({
  name: "ai-agent",
})
