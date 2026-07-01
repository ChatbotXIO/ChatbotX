import z from "zod"

const DIGITS_REGEX = /\d+/

export const zodBigintAsString = (message?: string) =>
  z.string().regex(DIGITS_REGEX, message ? { message } : undefined)
