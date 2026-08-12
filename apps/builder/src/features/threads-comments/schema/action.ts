import type { FBCommentAutomationModel } from "@chatbotx.io/database/types"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  createSearchParamsCache,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
} from "nuqs/server"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { threadsCommentResource } from "./resource"

const MAX_NAME_LENGTH = 120
const MAX_REPLY_LENGTH = 2000
const MAX_KEYWORDS = 25
const MAX_POST_IDS = 50
const MAX_KEYWORD_LENGTH = 120
const MAX_POST_ID_LENGTH = 120

const threadsCommentValidationKeyNames = [
  "postIdsMustBeEmptyForAll",
  "postIdsRequired",
  "keywordsMustBeEmptyForAll",
  "keywordsRequired",
  "delayMustBePositive",
  "delayMustBeZero",
  "atLeastOneFieldRequired",
] as const

type ThreadsCommentValidationKeyName =
  (typeof threadsCommentValidationKeyNames)[number]
type ThreadsCommentValidationMessageKey =
  `threadsCommentAutomation.validation.${ThreadsCommentValidationKeyName}`

type ThreadsCommentValidationMessages = Record<
  ThreadsCommentValidationKeyName,
  string
>

export const threadsCommentValidationKeys = Object.fromEntries(
  threadsCommentValidationKeyNames.map((key) => [
    key,
    `threadsCommentAutomation.validation.${key}`,
  ]),
) as Record<ThreadsCommentValidationKeyName, ThreadsCommentValidationMessageKey>

const defaultThreadsCommentValidationMessages: ThreadsCommentValidationMessages =
  threadsCommentValidationKeyNames.reduce((messages, key) => {
    messages[key] = threadsCommentValidationKeys[key]
    return messages
  }, {} as ThreadsCommentValidationMessages)

export function resolveThreadsCommentValidationMessages(
  resolver: (key: ThreadsCommentValidationMessageKey) => string,
): ThreadsCommentValidationMessages {
  return threadsCommentValidationKeyNames.reduce((messages, key) => {
    messages[key] = resolver(threadsCommentValidationKeys[key])
    return messages
  }, {} as ThreadsCommentValidationMessages)
}

const trimmedArray = (maxItems: number, maxLength: number) =>
  z
    .array(z.string().trim().min(1).max(maxLength))
    .max(maxItems)
    .transform((values) => [...new Set(values)])

export function createThreadsCommentRequestSchema(
  validationMessages: ThreadsCommentValidationMessages = defaultThreadsCommentValidationMessages,
) {
  const threadsReplySchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("none"), value: z.null() }),
    z.object({
      type: z.literal("text"),
      value: z.string().trim().min(1).max(MAX_REPLY_LENGTH),
    }),
    z.object({
      type: z.literal("flow"),
      value: zodBigintAsString(),
    }),
    z.object({
      type: z.literal("AIAgent"),
      value: zodBigintAsString(),
    }),
  ])

  const threadsPostSchema = z
    .object({
      type: z.enum(["all", "postIds"]),
      value: trimmedArray(MAX_POST_IDS, MAX_POST_ID_LENGTH),
    })
    .superRefine((value, ctx) => {
      if (value.type === "all" && value.value.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.postIdsMustBeEmptyForAll,
        })
      }
      if (value.type === "postIds" && value.value.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.postIdsRequired,
        })
      }
    })

  const threadsIncludeKeywordsSchema = z
    .object({
      type: z.enum(["all", "equal", "contain"]),
      value: trimmedArray(MAX_KEYWORDS, MAX_KEYWORD_LENGTH),
    })
    .superRefine((value, ctx) => {
      if (value.type === "all" && value.value.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.keywordsMustBeEmptyForAll,
        })
      }
      if (value.type !== "all" && value.value.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.keywordsRequired,
        })
      }
    })

  const threadsOptionsSchema = z.object({
    replyToNewContactsOnly: z.boolean(),
    replyOncePerUserPerPost: z.boolean(),
    replyToUsersWhoCommentedOnOtherPosts: z.boolean(),
    ignoreCommentReplies: z.boolean(),
  })

  const threadsReplyAfterSchema = z
    .object({
      type: z.enum([
        "immediately",
        "seconds",
        "minutes",
        "hours",
        "randomWithin3Minutes",
        "randomWithin5Minutes",
        "randomWithin10Minutes",
        "randomWithin20Minutes",
        "randomWithin30Minutes",
        "randomWithin60Minutes",
      ]),
      value: z.coerce
        .number()
        .int()
        .min(0)
        .max(24 * 60 * 60),
    })
    .superRefine((value, ctx) => {
      const requiresValue = ["seconds", "minutes", "hours"].includes(value.type)
      if (requiresValue && value.value <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.delayMustBePositive,
        })
      }
      if (!requiresValue && value.value !== 0) {
        ctx.addIssue({
          code: "custom",
          path: ["value"],
          message: validationMessages.delayMustBeZero,
        })
      }
    })

  return z.object({
    name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
    post: threadsPostSchema,
    publicReply: threadsReplySchema,
    includeKeywords: threadsIncludeKeywordsSchema,
    excludeKeywords: trimmedArray(MAX_KEYWORDS, MAX_KEYWORD_LENGTH),
    options: threadsOptionsSchema,
    replyAfter: threadsReplyAfterSchema,
  })
}

export const listThreadsCommentsRequest = basePaginationRequest.and(
  z.object({
    workspaceId: zodBigintAsString(),
    name: z.string().nullish(),
    isActive: z.boolean().nullish(),
  }),
)
export type ListThreadsCommentsRequest = z.infer<
  typeof listThreadsCommentsRequest
>

export const listThreadsCommentsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(10),
  name: parseAsString.withDefault(""),
  isActive: parseAsBoolean,
  sort: getSortingStateParser<FBCommentAutomationModel>().withDefault([
    { id: "createdAt", desc: true },
  ]),
})

export const listThreadsCommentsResponse = z.object({
  data: z.array(threadsCommentResource),
  pageCount: z.number(),
})
export type ListThreadsCommentsResponse = z.infer<
  typeof listThreadsCommentsResponse
>

export const createThreadsCommentRequest = createThreadsCommentRequestSchema()
export type CreateThreadsCommentRequest = z.infer<
  typeof createThreadsCommentRequest
>

export const updateThreadsCommentRequest = createThreadsCommentRequest
  .partial()
  .and(
    z.object({
      isActive: z.boolean().optional(),
    }),
  )
  .refine((value) => Object.keys(value).length > 0, {
    message: threadsCommentValidationKeys.atLeastOneFieldRequired,
  })
export type UpdateThreadsCommentRequest = z.infer<
  typeof updateThreadsCommentRequest
>
