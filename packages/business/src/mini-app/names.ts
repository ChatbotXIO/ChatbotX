import { isUniqueViolationError } from "@chatbotx.io/database/client"
import { MINI_APP_NAME_MAX_LENGTH } from "@chatbotx.io/mini-app"
import { validationException } from "../errors"

export const NAME_TAKEN = "Name is already taken"

/** Turns a unique-name violation into a `name` validation error; rethrows anything else. */
export const rethrowNameTaken = (error: unknown): never => {
  if (isUniqueViolationError(error)) {
    throw validationException("name", NAME_TAKEN)
  }
  throw error
}

export const MAX_COPY_NAME_ATTEMPTS = 50

const copyNameSuffix = (attempt: number) =>
  attempt === 1 ? " - Copy" : ` - Copy ${attempt}`

/** `<name> - Copy`, then `<name> - Copy 2`, … cut to fit the name limit. */
export const copyName = (name: string, attempt: number): string => {
  const suffix = copyNameSuffix(attempt)
  return `${name.slice(0, MINI_APP_NAME_MAX_LENGTH - suffix.length)}${suffix}`
}

/** The start every copy name of `name` shares, however much it was cut. */
export const copyNamePrefix = (name: string): string =>
  name.slice(
    0,
    MINI_APP_NAME_MAX_LENGTH - copyNameSuffix(MAX_COPY_NAME_ATTEMPTS).length,
  )
