import { channelTypes } from "@chatbotx.io/database/partials"
import {
  isValidPostgresTimestampWithOffset,
  POSTGRES_TIMESTAMP_WITH_OFFSET,
} from "@chatbotx.io/utils/postgres-timestamp"
import { z } from "zod"

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n
const POSITIVE_BIGINT_PATTERN = /^[1-9]\d*$/

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
