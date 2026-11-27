import { RE2JS } from "re2js"
import { z } from "zod"
import {
  isValuelessKeywordConditionOperator,
  type KeywordCondition,
  keywordConditionOperators,
  MAX_KEYWORD_CONDITION_VALUES,
  MAX_KEYWORD_CONDITIONS,
  MAX_KEYWORD_REGEX_LENGTH,
} from "./automated-response"

// Kept out of the `partials` barrel: re2js is ~260 KB and only keyword
// validation and matching need it, not every client component importing an
// enum from partials.

// RE2 runs in linear time, so a user-supplied pattern such as `(a+)+$` can
// never stall the worker the way a backtracking `RegExp` would.
export const compileKeywordRegex = (pattern: string): RE2JS | null => {
  if (pattern.length > MAX_KEYWORD_REGEX_LENGTH) {
    return null
  }
  try {
    return RE2JS.compile(pattern, RE2JS.CASE_INSENSITIVE)
  } catch {
    return null
  }
}

export const keywordConditionSchema: z.ZodType<
  KeywordCondition,
  { operator: KeywordCondition["operator"]; values: string[] }
> = z
  .object({
    operator: keywordConditionOperators,
    values: z
      .array(z.string().trim().min(1).max(255))
      .max(MAX_KEYWORD_CONDITION_VALUES),
  })
  .superRefine((condition, ctx) => {
    if (isValuelessKeywordConditionOperator(condition.operator)) {
      if (condition.values.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["values"],
          message: "keywordConditionTakesNoValues",
        })
      }
      return
    }
    if (condition.values.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["values"],
        message: "keywordConditionValuesRequired",
      })
      return
    }
    if (condition.operator !== "matchesRegex") {
      return
    }
    condition.values.forEach((pattern, index) => {
      if (!compileKeywordRegex(pattern)) {
        ctx.addIssue({
          code: "custom",
          path: ["values", index],
          message: "invalidKeywordRegex",
        })
      }
    })
  })

export const keywordConditionsSchema = z
  .array(keywordConditionSchema)
  .min(1)
  .max(MAX_KEYWORD_CONDITIONS)
