import { channelTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n
const POSITIVE_BIGINT_PATTERN = /^[1-9]\d*$/
const POSTGRES_TIMESTAMP_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2})(?::?(\d{2}))?)$/

const isValidPostgresTimestampWithOffset = (value: string): boolean => {
  const match = POSTGRES_TIMESTAMP_WITH_OFFSET.exec(value)
  if (!match) {
    return false
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetHourText,
    offsetMinuteText,
  ] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const offsetHour = offsetHourText ? Number(offsetHourText) : undefined
  const offsetMinute = offsetMinuteText ? Number(offsetMinuteText) : undefined

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    (offsetHour === undefined ||
      (offsetHour <= 23 && (offsetMinute === undefined || offsetMinute <= 59)))
  )
}

export const channelPostId = z
  .string()
  .max(19)
  .regex(POSITIVE_BIGINT_PATTERN)
  .refine(
    (value) => {
      if (!POSITIVE_BIGINT_PATTERN.test(value)) {
        return false
      }
      return BigInt(value) <= MAX_SIGNED_BIGINT
    },
    {
      message: "Must be a signed bigint id",
    },
  )

export const channelPostIds = z
  .array(channelPostId)
  .min(1)
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "Post ids must be unique",
  })

export const channelPostCursor = z.object({
  id: channelPostId,
  sortAt: z
    .string()
    .regex(POSTGRES_TIMESTAMP_WITH_OFFSET)
    .refine(isValidPostgresTimestampWithOffset, {
      message: "Must be a valid PostgreSQL timestamp with offset",
    }),
})

export const isChannelPostId = (value: unknown): value is string =>
  channelPostId.safeParse(value).success

export const channelPostOption = z.object({
  caption: z.string().nullable(),
  channel: channelTypes,
  externalPostId: z.string(),
  id: z.string(),
  inboxId: z.string(),
  inboxName: z.string(),
  permalink: z.string().nullable(),
  publishedAt: z.date().nullable(),
  thumbnailUrl: z.string().nullable(),
})
