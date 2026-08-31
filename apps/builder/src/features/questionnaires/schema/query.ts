import type { QuestionnaireModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export const listQuestionnairesSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<QuestionnaireModel>().withDefault([
    { id: "name", desc: false },
  ]),
}

export const listQuestionnairesSearchParamsCache = createSearchParamsCache(
  listQuestionnairesSearchParams,
)

export type ListQuestionnairesRequest = Awaited<
  ReturnType<typeof listQuestionnairesSearchParamsCache.parse>
> & { workspaceId: string }

export const listQuestionnaireSubmissionsSearchParams = {
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString,
  sort: getSortingStateParser<{
    name: string
    totalPoints: number | null
    status: string
    completedAt: Date | null
  }>(["name", "totalPoints", "status", "completedAt"]).withDefault([]),
}

export const listQuestionnaireSubmissionsSearchParamsCache =
  createSearchParamsCache(listQuestionnaireSubmissionsSearchParams)

export type ListQuestionnaireSubmissionsRequest = Awaited<
  ReturnType<typeof listQuestionnaireSubmissionsSearchParamsCache.parse>
> & { workspaceId: string; questionnaireId: string }

export const listQuestionnairesForFlowRequest = withWorkspaceIdSchema.and(
  z.object({
    keyword: z.string().optional(),
  }),
)

export const listQuestionnairesForFlowResponse = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
  }),
)

export type ListQuestionnairesForFlowResponse = z.infer<
  typeof listQuestionnairesForFlowResponse
>
