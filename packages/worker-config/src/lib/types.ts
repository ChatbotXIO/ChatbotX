import { z } from "zod"

export const queueNames = z.enum([
  "integration",
  "chat",
  "aiAgent",
  "heavy",
  "schedule",
  "trigger",
  "webhook",
  "default",
  "sequenceScheduler",
  "broadcast",
  "quota",
  "notification",
])
