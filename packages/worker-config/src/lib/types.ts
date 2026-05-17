import { z } from "zod"

export const queueNames = z.enum([
  "integration",
  "chat",
  "aiAgent",
  "schedule",
  "trigger",
  "webhook",
  "default",
  "analytics",
  "sequenceScheduler",
  "broadcast",
])
