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

/** How mini app copies are named: `<name> - Copy`, `<name> - Copy 2`, … */
export const MINI_APP_COPY_NAME = {
  style: "dash",
  maxLength: MINI_APP_NAME_MAX_LENGTH,
} as const
