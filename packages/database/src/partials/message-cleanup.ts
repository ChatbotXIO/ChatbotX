import { z } from "zod"

export const messageCleanupStatuses = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
])
export type MessageCleanupStatus = z.infer<typeof messageCleanupStatuses>
