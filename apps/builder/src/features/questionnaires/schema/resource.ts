import {
  createSelectSchema,
  questionnaireModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const questionnaireResource = createSelectSchema(questionnaireModel, {
  id: z.string(),
  workspaceId: z.string(),
  triggerFlowId: z.string().nullable(),
})
export type QuestionnaireResource = z.infer<typeof questionnaireResource>

export type QuestionnaireListItem = Pick<
  QuestionnaireResource,
  "id" | "workspaceId" | "name" | "createdAt" | "updatedAt"
> & {
  applicantsCount: number
}
