import z from "zod"

const DIGITS_REGEX = /\d+/

export const zodBigintAsString = () => z.string().regex(DIGITS_REGEX)
