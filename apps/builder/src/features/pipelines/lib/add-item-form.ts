import {
  pipelineItemPriorities,
  pipelineItemStatuses,
} from "@chatbotx.io/database/partials"
import { z } from "zod"

/** The value column holds money: four decimals, never negative. */
export const ITEM_VALUE_DECIMALS = 4
const TITLE_MAX = 200
const DESCRIPTION_MAX = 5000
const MEMBER_PREFIX = "u_"
const TEAM_PREFIX = "t_"

export const addItemFormSchema = z.object({
  title: z.string().trim().min(1).max(TITLE_MAX),
  value: z.number().min(0).optional(),
  description: z.string().max(DESCRIPTION_MAX),
  priority: pipelineItemPriorities,
  status: pipelineItemStatuses,
  /** Empty = the first free stage. */
  stageId: z.string().optional(),
  /** ISO instant from the date picker. */
  dueDate: z.string().optional(),
  /** `u_<memberId>` / `t_<teamId>` values of the assignee multi-select. */
  assignees: z.array(z.string()),
  fieldValues: z.record(z.string(), z.string()),
})

export type AddItemFormValues = z.infer<typeof addItemFormSchema>

export const initialAddItemFormValues = (
  fieldIds: readonly string[] = [],
): AddItemFormValues => ({
  title: "",
  value: undefined,
  description: "",
  priority: "medium",
  status: "open",
  stageId: undefined,
  dueDate: undefined,
  assignees: [],
  fieldValues: Object.fromEntries(fieldIds.map((id) => [id, ""])),
})

/** Splits the multi-select values back into member ids and team ids. */
export const splitAssignees = (
  values: readonly string[],
): { memberIds: string[]; teamIds: string[] } => ({
  memberIds: values
    .filter((value) => value.startsWith(MEMBER_PREFIX))
    .map((value) => value.slice(MEMBER_PREFIX.length)),
  teamIds: values
    .filter((value) => value.startsWith(TEAM_PREFIX))
    .map((value) => value.slice(TEAM_PREFIX.length)),
})

/** A required custom field with no value blocks the save. */
export const hasMissingRequiredField = (
  fields: ReadonlyArray<{ id: string; required: boolean }>,
  fieldValues: Record<string, string | undefined>,
): boolean => fields.some((field) => field.required && !fieldValues[field.id])
