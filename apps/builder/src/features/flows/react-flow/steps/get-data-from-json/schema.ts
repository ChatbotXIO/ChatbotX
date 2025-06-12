import { ActionType } from "@/features/flows/react-flow/action-type"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const responseDataFromJsonSchema = z.object({
  path: z.string().min(1),
  customFieldId: z.string().cuid2(),
})

export const getDataFromJsonSchema = z.object({
  id: z.string().cuid2(),
  actionType: z.literal(ActionType.GetDataFromJson),
  fromCustomFieldId: z.string().cuid2(),
  responses: z.array(responseDataFromJsonSchema),
})
export type GetDataFromJsonSchema = z.infer<typeof getDataFromJsonSchema>

export const responseDataFromJsonDefaultValue = () => ({
  path: "",
  customFieldId: "",
})

export const getDataFromJsonDefaultValue = (): GetDataFromJsonSchema => ({
  id: createId(),
  actionType: ActionType.GetDataFromJson,
  fromCustomFieldId: "",
  responses: [responseDataFromJsonDefaultValue()],
})
