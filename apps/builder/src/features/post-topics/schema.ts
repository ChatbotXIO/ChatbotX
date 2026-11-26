import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { z } from "zod"

const topicName = z.string().trim().min(1).max(100)
const topicColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color such as #1a73e8.")

export const postTopicResource = z.object({
  color: z.string().nullable(),
  id: z.string(),
  name: z.string(),
})

/** A topic id as filters and post updates carry it. */
export const postTopicId = zodBigintIdAsString()

/** The label a post carries for one of its topics. */
export const postTopicLabel = z.object({
  color: z.string().nullable(),
  id: z.string(),
  name: z.string(),
})

export const postTopicIdRequest = z.object({
  id: zodBigintIdAsString().describe(
    "Topic id. Get it from `postTopics.list`.",
  ),
})

export const listPostTopicsRequest = z.object({
  search: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe("Case-insensitive substring match against the topic name."),
})

export const listPostTopicsResponse = z.object({
  items: z.array(postTopicResource),
})

export const createPostTopicRequest = z.object({
  color: topicColor
    .nullable()
    .optional()
    .describe("Hex color, or null for none."),
  name: topicName.describe("Unique within the workspace."),
})

export const updatePostTopicRequest = postTopicIdRequest.extend({
  color: topicColor
    .nullable()
    .optional()
    .describe("Hex color, or null to clear."),
  name: topicName.optional().describe("New name, unique within the workspace."),
})
