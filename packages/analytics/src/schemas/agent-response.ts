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
} & AgentResponseSlaStats

/**
 * SLA outcome of the replies. "Eligible" = replies whose window had an SLA
 * snapshot (`slaMet` not null); replies before the feature, or in a workspace
 * without a policy, are not counted as misses. The percent is `null` when
 * nothing is eligible.
 */
export type AgentResponseSlaStats = {
  responseSlaEligibleCount: number
  responseSlaMetCount: number
  responseSlaMetPercent: number | null
  firstResponseSlaEligibleCount: number
  firstResponseSlaMetCount: number
  firstResponseSlaMetPercent: number | null
}

/** The same measures bucketed per local day (`YYYY-MM-DD`). */
export type AgentResponseDailyAverages = AgentResponseAverages & {
  date: string
}

/** Zod shape of {@link AgentResponseSlaStats}, shared by every schema that carries it. */
export const agentResponseSlaStatsShape = {
  responseSlaEligibleCount: z.number(),
  responseSlaMetCount: z.number(),
  responseSlaMetPercent: z.number().nullable(),
  firstResponseSlaEligibleCount: z.number(),
  firstResponseSlaMetCount: z.number(),
  firstResponseSlaMetPercent: z.number().nullable(),
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
  ...agentResponseSlaStatsShape,
})
export type AgentResponseSeriesRow = z.infer<
  typeof agentResponseSeriesRowSchema
>

export const getAgentResponseSeriesResponseSchema = z.object({
  data: z.array(agentResponseSeriesRowSchema),
})
