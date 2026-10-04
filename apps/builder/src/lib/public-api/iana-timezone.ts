import { z } from "zod"

const isValidIanaTimezone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** An IANA timezone name such as `Asia/Ho_Chi_Minh`; anything else is a 422. */
export const ianaTimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(isValidIanaTimezone, { message: "Invalid IANA timezone" })
