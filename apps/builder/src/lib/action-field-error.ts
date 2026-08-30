import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors, type ValidationErrors } from "next-safe-action"
import type { z } from "zod"

const DEFAULT_FIELD_ERROR_CODES = ["nameTaken"] as const

/**
 * Boundary adapter between services and next-safe-action forms.
 *
 * Services signal domain-level validation failures (e.g. a duplicate name) by
 * throwing `ChatbotXException` with a well-known `code`. Left alone, a server
 * action surfaces that as a generic `serverError` toast; this helper turns it
 * back into a `returnValidationErrors` field error so the form shows the
 * message under `field`, exactly like a schema validation failure would.
 *
 * The displayed message is always translated here — `ChatbotXException.message`
 * is an internal, English-only wire message (i18n is mandatory for anything
 * shown to a user, and `packages/business` has no access to request locale).
 * `featureLabelKey` names the `fields.<key>.label` entry substituted into
 * `messages.nameAlreadyExists`, matching the pattern used by
 * qr-codes/create-qr-code.action.ts and friends. Any other error propagates
 * untouched.
 */
export async function mapExceptionToFieldError<S extends z.ZodType, T>(
  schema: S,
  field: keyof z.input<S> & string,
  run: () => Promise<T>,
  featureLabelKey: string,
  codes: readonly string[] = DEFAULT_FIELD_ERROR_CODES,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ChatbotXException && codes.includes(error.code)) {
      const t = await getTranslations()
      return returnValidationErrors(schema, {
        [field]: {
          _errors: [
            t("messages.nameAlreadyExists", {
              feature: t(`fields.${featureLabelKey}.label`),
            }),
          ],
        },
      } as ValidationErrors<S>)
    }
    throw error
  }
}
