import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

/** Per-admin response-time measures; averages are null when the admin has no matching rows. */
export type AgentResponseAverages = {
  adminId: string
  avgResponseSeconds: number | null
  avgWorkingResponseSeconds: number | null
  avgFirstResponseSeconds: number | null
  avgWorkingFirstResponseSeconds: number | null
  responseCount: number
  firstResponseCount: number
}

/** The same measures bucketed per local day (`YYYY-MM-DD`). */
export type AgentResponseDailyAverages = AgentResponseAverages & {
  date: string
}

export const agentResponseSeriesRowSchema = z.object({
  adminId: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
  date: z.string(),
  userName: z.string().optional(),
  userEmail: z.string().optional(),
  avgResponseSeconds: z.number().nullable(),
  avgWorkingResponseSeconds: z.number().nullable(),
  avgFirstResponseSeconds: z.number().nullable(),
  avgWorkingFirstResponseSeconds: z.number().nullable(),
  responseCount: z.number(),
  firstResponseCount: z.number(),
})
export type AgentResponseSeriesRow = z.infer<
  typeof agentResponseSeriesRowSchema
>

export const getAgentResponseSeriesResponseSchema = z.object({
  data: z.array(agentResponseSeriesRowSchema),
})
