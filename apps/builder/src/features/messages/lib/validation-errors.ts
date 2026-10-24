type ValidationError = {
  message: string
  path: string
}

const ROOT_VALIDATION_ERROR_PATH = "root.server"

export const flattenValidationErrors = (
  errors: unknown,
  prefix = "",
): ValidationError[] => {
  if (!errors || typeof errors !== "object") {
    return []
  }

  const validationErrors: ValidationError[] = []
  for (const [key, value] of Object.entries(errors)) {
    if (key === "_errors") {
      const message = Array.isArray(value) ? value[0] : undefined
      if (typeof message === "string") {
        validationErrors.push({
          message,
          path: prefix || ROOT_VALIDATION_ERROR_PATH,
        })
      }
      continue
    }

    validationErrors.push(
      ...flattenValidationErrors(value, prefix ? `${prefix}.${key}` : key),
    )
  }

  return validationErrors
}
