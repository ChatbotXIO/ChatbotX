import pino from "pino"

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() } // Use 'INFO' instead of 30
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime, // Use ISO 8601 format
})

export const getChildLogger = (name: string) => {
  return baseLogger.child({ module: name })
}

export default baseLogger
