import { socialPostSnippetKinds } from "@chatbotx.io/database/partials"
import { zodBigintIdAsString } from "@chatbotx.io/utils"
import { publishDestinationStates } from "@chatbotx.io/utils/publish-destination"
import { z } from "zod"

const MAX_NAME_LENGTH = 100
/** Most characters of a snippet; a post's own limit still applies where it is used. */
const MAX_SNIPPET_LENGTH = 2000
const MAX_POSITION = 1000
const MAX_SET_DESTINATIONS = 30

const snippetName = z.string().trim().min(1).max(MAX_NAME_LENGTH)
const snippetContent = z.string().trim().min(1).max(MAX_SNIPPET_LENGTH)
const destinationIds = z
  .array(zodBigintIdAsString())
  .min(1)
  .max(MAX_SET_DESTINATIONS)

export const postSnippetResource = z.object({
  content: z.string(),
  id: z.string(),
  kind: socialPostSnippetKinds,
  name: z.string(),
  position: z.number(),
})

export const postSnippetIdRequest = z.object({
  id: zodBigintIdAsString().describe(
    "Snippet id. Get it from `postSnippets.list`.",
  ),
})

export const listPostSnippetsRequest = z.object({
  kind: socialPostSnippetKinds
    .optional()
    .describe("Only snippets of this kind."),
})

export const listPostSnippetsResponse = z.object({
  items: z.array(postSnippetResource),
})

export const createPostSnippetRequest = z.object({
  content: snippetContent.describe(
    "Plain text, up to 2000 characters. No variables.",
  ),
  kind: socialPostSnippetKinds.describe(
    "`signature` is appended to a post's text when you give its id as `signatureId` to `socialPosts.create`; `hashtags` and `text` are inserted by the composer.",
  ),
  name: snippetName.describe("Unique within the workspace."),
})

export const updatePostSnippetRequest = postSnippetIdRequest.extend({
  content: snippetContent.optional().describe("New text."),
  kind: socialPostSnippetKinds.optional().describe("New kind."),
  name: snippetName.optional().describe("New name, unique in the workspace."),
  position: z
    .number()
    .int()
    .min(0)
    .max(MAX_POSITION)
    .optional()
    .describe("Order in the picker; the lowest comes first."),
})

const targetSetDestination = z.object({
  id: z.string(),
  state: publishDestinationStates.describe(
    "`ready` can take a post; `inboxDisconnected`: the inbox is disconnected; `needsReconnect`: its connection expired; `permissionMissing`: the publishing permission is not granted. A set never hides these: skip them when you create a post.",
  ),
})

export const postTargetSetResource = z.object({
  destinations: z.array(targetSetDestination),
  id: z.string(),
  name: z.string(),
})

export const postTargetSetIdRequest = z.object({
  id: zodBigintIdAsString().describe(
    "Set id. Get it from `postTargetSets.list`.",
  ),
})

export const listPostTargetSetsResponse = z.object({
  items: z.array(postTargetSetResource),
})

export const createPostTargetSetRequest = z.object({
  destinationIds: destinationIds.describe(
    "Destination ids from `publishDestinations.list`, each once, at most 30.",
  ),
  name: snippetName.describe("Unique within the workspace."),
})

export const updatePostTargetSetRequest = postTargetSetIdRequest.extend({
  destinationIds: destinationIds
    .optional()
    .describe("Replaces the set's destinations."),
  name: snippetName.optional().describe("New name, unique in the workspace."),
})
