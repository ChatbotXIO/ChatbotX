import { z } from "zod"
import { GoogleAdsException } from "../exception"

/** Numeric Google conversion action id. */
export const conversionActionIdSchema = z.string().regex(/^\d+$/)

export const MALFORMED_ID_STATUS = 400
export const MALFORMED_RESPONSE_STATUS = 502

/** A malformed id can never succeed on retry: fail terminally with a fixed message. */
export const parseId = (
  schema: z.ZodType<string>,
  value: string,
  label: string,
): string => {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new GoogleAdsException({
      httpStatusCode: MALFORMED_ID_STATUS,
      reason: "invalidIdentifier",
      retryable: false,
      message: `Google Ads ${label} is malformed`,
      details: [],
    })
  }
  return parsed.data
}

/**
 * Google answered 2xx but the body is unreadable. The request may already be
 * recorded, so resending blindly could duplicate it: terminal, fixed message.
 */
export const malformedResponse = (message: string): GoogleAdsException =>
  new GoogleAdsException({
    httpStatusCode: MALFORMED_RESPONSE_STATUS,
    reason: "malformedResponse",
    retryable: false,
    message,
    details: [],
  })
