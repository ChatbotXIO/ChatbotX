"use client"

import { useTranslations } from "next-intl"
import type { z } from "zod"

const isEmpty = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (typeof value === "number" && Number.isNaN(value))

/**
 * zod's own sentences are technical and English only ("Too small: expected
 * string to have >=3 characters"). This error map says the same in plain,
 * translated words; pass it as `{ error }` when a form parses its schema.
 */
export function useValidationErrorMap(): z.core.$ZodErrorMap {
  const t = useTranslations("validation.form")
  return (issue) => {
    switch (issue.code) {
      case "invalid_type": {
        if (issue.expected === "int") {
          return t("wholeNumber")
        }
        if (isEmpty(issue.input)) {
          return t("required")
        }
        return issue.expected === "number" ? t("number") : t("invalid")
      }
      case "too_small": {
        const minimum = Number(issue.minimum)
        if (issue.origin === "string") {
          return minimum <= 1 ? t("required") : t("minLength", { minimum })
        }
        if (issue.origin === "array" || issue.origin === "set") {
          return t("minItems", { minimum })
        }
        if (issue.origin === "number" || issue.origin === "bigint") {
          return issue.inclusive
            ? t("minNumber", { minimum })
            : t("moreThan", { minimum })
        }
        return t("invalid")
      }
      case "too_big": {
        const maximum = Number(issue.maximum)
        if (issue.origin === "string") {
          return t("maxLength", { maximum })
        }
        if (issue.origin === "array" || issue.origin === "set") {
          return t("maxItems", { maximum })
        }
        if (issue.origin === "number" || issue.origin === "bigint") {
          return issue.inclusive
            ? t("maxNumber", { maximum })
            : t("lessThan", { maximum })
        }
        return t("invalid")
      }
      case "invalid_format": {
        if (issue.format === "email") {
          return t("email")
        }
        if (issue.format === "url") {
          return t("url")
        }
        return t("format")
      }
      case "invalid_value":
        return t("option")
      default:
        return t("invalid")
    }
  }
}
