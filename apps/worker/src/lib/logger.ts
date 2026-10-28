import { getChildLogger } from "@chatbotx.io/logger"
import { installSourceMappedStacks } from "@chatbotx.io/logger/source-mapped-stack"

installSourceMappedStacks()

export const logger = getChildLogger("worker")
