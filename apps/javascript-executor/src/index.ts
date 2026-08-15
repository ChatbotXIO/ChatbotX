import "dotenv/config"
import { pathToFileURL } from "node:url"
import { getChildLogger } from "@chatbotx.io/logger"
import { env } from "./env"
import { startJavascriptExecutor } from "./lifecycle"
import { createServer } from "./server"

const logger = getChildLogger("javascript-executor")

export const main = async (): Promise<void> => {
  await startJavascriptExecutor({
    host: env.HOST,
    logger,
    port: env.PORT,
    server: createServer(),
  })
}

const entrypointPath = process.argv[1]
if (
  entrypointPath &&
  import.meta.url === pathToFileURL(entrypointPath).toString()
) {
  main().catch((error: unknown) => {
    logger.error({ err: error }, "JavaScript executor failed to start")
    process.exit(1)
  })
}
