import { logger } from "@/lib/log"

export const GET = async () => {
  logger.info("Hello, world!")

  return await new Response("Hello, world!")
}
