import {
  type FormFieldType,
  formFieldTypes,
  type OperatorType,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { booleanOperators } from "./boolean-filter"
import { datetimeOperators } from "./datetime-filter"
import { contactFilterConditionSchemas } from "./definitions"
import { multiSelectOperators } from "./multi-select-filter"
import { numberOperators } from "./number"
import { selectOperators } from "./select-filter"
import { textOperators } from "./text-filter"

export {
  CONTACT_FILTER_FIELD_DEFINITIONS,
  type ContactFilterFieldDefinition,
  type ContactFilterOptionSource,
  type ContactFilterSchemaKind,
  contactFilterConditionSchemas,
} from "./definitions"

export const mappingConditions: Record<FormFieldType, OperatorType[]> = {
  [formFieldTypes.enum.multiSelect]: multiSelectOperators,
  [formFieldTypes.enum.select]: selectOperators,
  [formFieldTypes.enum.text]: textOperators,
  [formFieldTypes.enum.boolean]: booleanOperators,
  [formFieldTypes.enum.datetime]: datetimeOperators,
  [formFieldTypes.enum.number]: numberOperators,
}

/** One validated condition row (matches `conditions` elements in {@link contactFilterCriteriaSchema}). */
export const singleContactFilterConditionSchema = z.discriminatedUnion(
  "field",
  // Zod v4 narrows discriminatedUnion options tighter than inferred schema tuples.
  // @ts-expect-error Expected readonly [$ZodTypeDiscriminable, ...]; runtime union is correct.
  contactFilterConditionSchemas,
)

export type ContactFilterCondition = z.infer<
  (typeof contactFilterConditionSchemas)[number]
>

export const contactFilterCriteriaSchema = z.object({
  operator: z.enum(["and", "or"]),
  conditions: z.array(singleContactFilterConditionSchema),
})

export type ContactFilterCriteria = z.infer<typeof contactFilterCriteriaSchema>

export const contactFilterRequest = z.object({
  contactFilter: contactFilterCriteriaSchema,
})
export type ContactFilterRequest = z.infer<typeof contactFilterRequest>
