"use client"

import { toNestErrors } from "@hookform/resolvers"
import { useTranslations } from "next-intl"
import type {
  FieldError,
  FieldPath,
  FieldValues,
  Resolver,
} from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"
import { useValidationErrorMap } from "./use-validation-error-map"

/**
 * The `handleSubmit` invalid callback: on a long form the marked field can be
 * off screen, so say that something needs fixing.
 */
export function useInvalidFormToast() {
  const t = useTranslations("validation.form")
  return () => {
    toast.error(t("checkFields"))
  }
}

/** A check the server makes beyond the schema, with its translated sentence. */
export type FieldRule<Values extends FieldValues> = {
  field: FieldPath<Values>
  message: string
}

/**
 * Checks a form the way the server will: builds the request exactly as the
 * submit does, parses it with the action's own schema, and puts each problem,
 * in plain translated words, on the field it belongs to. `rules` repeat the
 * server's checks the schema cannot express; they win over a schema message
 * for the same field.
 */
export function useRequestResolver<Values extends FieldValues>({
  schema,
  toRequest,
  fieldFor,
  rules,
}: {
  schema: z.ZodType
  toRequest: (values: Values) => unknown
  /** The form field for a request path such as `checkout.checkoutLink`. */
  fieldFor?: (path: string, values: Values) => string | undefined
  rules?: (values: Values) => Array<FieldRule<Values> | false | undefined>
}): Resolver<Values> {
  const t = useTranslations("validation.form")
  const errorMap = useValidationErrorMap()

  return (values, _context, options) => {
    const errors: Record<string, FieldError> = {}
    const add = (field: string | undefined, message: string) => {
      if (field && !errors[field]) {
        errors[field] = { type: "validation", message }
      }
    }
    for (const rule of rules?.(values) ?? []) {
      if (rule) {
        add(rule.field, rule.message)
      }
    }
    const result = schema.safeParse(toRequest(values), { error: errorMap })
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path.join(".")
        // A schema's own `refine` sentence is English; say it plainly instead.
        add(
          fieldFor ? fieldFor(path, values) : path,
          issue.code === "custom" ? t("invalid") : issue.message,
        )
      }
    }
    if (Object.keys(errors).length === 0) {
      return { values, errors: {} }
    }
    return { values: {}, errors: toNestErrors(errors, options) }
  }
}
