import { z } from "zod"

// Generic Meta Graph messaging conversation/message pull, shared by every
// Instagram coexist provider (native Instagram Login and Instagram-via-
// Facebook). The caller injects the Graph client, default API version, error
// wrapper, and the conversations node/params — so this module holds no
// provider- or channel-specific detail and stays reusable.

const PAGE_LIMIT = 100
const DETAIL_FETCH_LIMIT = 20

const participantSchema = z.object({
  id: z.string(),
  username: z.string().optional(),
  name: z.string().optional(),
})

const attachmentSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  payload: z.object({ url: z.string().optional() }).optional(),
  image_data: z
    .object({
      url: z.string().optional(),
      preview_url: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
  video_data: z
    .object({
      url: z.string().optional(),
      preview_url: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
  file_url: z.string().optional(),
  name: z.string().optional(),
  mime_type: z.string().optional(),
  size: z.number().optional(),
})

const graphPageSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema).optional(),
    paging: z
      .object({
        cursors: z.object({ after: z.string().optional() }).optional(),
        next: z.string().optional(),
      })
      .optional(),
  })

const messageDetailSchema = z.object({
  id: z.string(),
  message: z.string().optional(),
  from: participantSchema.optional(),
  to: graphPageSchema(participantSchema).optional(),
  created_time: z.string().optional(),
  attachments: graphPageSchema(attachmentSchema).optional(),
  is_unsupported: z.boolean().optional(),
})

const conversationSchema = z.object({
  id: z.string(),
  updated_time: z.string().optional(),
  participants: graphPageSchema(participantSchema).optional(),
})

const conversationMessagesSchema = z.object({
  id: z.string(),
  messages: graphPageSchema(messageDetailSchema).optional(),
})

const appUsageSchema = z
  .object({
    call_count: z.number().optional(),
    total_cputime: z.number().optional(),
    total_time: z.number().optional(),
  })
  .passthrough()

export type GraphSyncParticipant = z.infer<typeof participantSchema>
export type GraphSyncHistoryAttachment = z.infer<typeof attachmentSchema>
export type GraphSyncHistoryMessage = z.infer<typeof messageDetailSchema>
export type GraphSyncConversation = z.infer<typeof conversationSchema>
export type GraphSyncAppUsage = z.infer<typeof appUsageSchema>

export type GraphSyncPaginatedResult<T> = {
  data: T[]
  after?: string
  appUsage?: GraphSyncAppUsage | null
}

// Minimal Graph client contract both integration HTTP clients already satisfy.
export type GraphSyncHttpClient = {
  get<T>(
    url: string,
    options?: {
      headers?: Record<string, string>
      searchParams?: Record<string, string>
    },
  ): Promise<T>
  getWithHeaders<T>(
    url: string,
    options?: {
      headers?: Record<string, string>
      searchParams?: Record<string, string>
    },
  ): Promise<{ data: T; headers: Headers }>
}

export type GraphConversationSyncConfig = {
  client: GraphSyncHttpClient
  defaultVersion: string
  // Per-integration error wrapper so channel-specific exception typing (used by
  // revoked-token detection downstream) is preserved.
  rescue: <T>(endpoint: string, fn: () => Promise<T>) => Promise<T>
}

type GraphPaging = { cursors?: { after?: string }; next?: string }

const nextCursor = (paging: GraphPaging | undefined): string | undefined =>
  paging?.next ? paging.cursors?.after : undefined

const parseAppUsageHeader = (
  value: string | null,
): GraphSyncAppUsage | null => {
  if (!value) {
    return null
  }
  try {
    const parsedJson: unknown = JSON.parse(value)
    const parsed = appUsageSchema.safeParse(parsedJson)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const hasInlineMessageDetails = (message: GraphSyncHistoryMessage): boolean =>
  Boolean(
    message.created_time ??
      message.from ??
      message.to ??
      message.message ??
      message.attachments,
  )

const shouldFetchMessageDetails = (
  messages: GraphSyncHistoryMessage[],
): boolean =>
  messages.length > 0 && messages.some((m) => !hasInlineMessageDetails(m))

const contactProfileSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  username: z.string().optional(),
})

export type GraphSyncContactProfile = z.infer<typeof contactProfileSchema>

export type GraphSyncContactProfileResult = {
  profile: GraphSyncContactProfile
  appUsage: GraphSyncAppUsage | null
}

export type GraphConversationSync = {
  listConversations(props: {
    node: string
    accessToken: string
    version?: string
    after?: string
    searchParams?: Record<string, string>
  }): Promise<GraphSyncPaginatedResult<GraphSyncConversation>>
  fetchConversationMessages(props: {
    conversationId: string
    accessToken: string
    version?: string
    after?: string
  }): Promise<GraphSyncPaginatedResult<GraphSyncHistoryMessage>>
  // Resolve a participant's display name from the user node. The conversations
  // participants edge only returns `{id, username}` for Instagram, so the real
  // `name` (used to derive first/last name) must be read from the user node.
  // Surfaces `x-app-usage` so the caller can feed it to the shared throttle.
  fetchContactProfile(props: {
    userId: string
    accessToken: string
    version?: string
  }): Promise<GraphSyncContactProfileResult>
}

export const createGraphConversationSync = (
  config: GraphConversationSyncConfig,
): GraphConversationSync => {
  const { client, defaultVersion, rescue } = config

  const fetchMessageDetails = (props: {
    messageId: string
    accessToken: string
    version: string
  }): Promise<GraphSyncHistoryMessage> => {
    const endpoint = `${props.version}/${props.messageId}`
    return rescue(endpoint, async () => {
      const response = await client.get<unknown>(endpoint, {
        headers: { Authorization: `Bearer ${props.accessToken}` },
        searchParams: {
          fields: "id,created_time,from,to,message,attachments,is_unsupported",
        },
      })
      return messageDetailSchema.parse(response)
    })
  }

  const hydrateMissingDetails = async (props: {
    messages: GraphSyncHistoryMessage[]
    accessToken: string
    version: string
  }): Promise<GraphSyncHistoryMessage[]> => {
    if (!shouldFetchMessageDetails(props.messages)) {
      return props.messages
    }

    const detailById = new Map<string, GraphSyncHistoryMessage>()
    const detailCandidates = props.messages
      .filter((message) => !hasInlineMessageDetails(message))
      .slice(0, DETAIL_FETCH_LIMIT)

    for (const message of detailCandidates) {
      try {
        detailById.set(
          message.id,
          await fetchMessageDetails({
            messageId: message.id,
            accessToken: props.accessToken,
            version: props.version,
          }),
        )
      } catch {
        // Detail lookups are documented as limited to the 20 most recent
        // messages. Keep the ref-only message; import skips empty messages.
      }
    }

    return props.messages.map(
      (message) => detailById.get(message.id) ?? message,
    )
  }

  return {
    listConversations({ node, accessToken, version, after, searchParams }) {
      const apiVersion = version ?? defaultVersion
      const endpoint = `${apiVersion}/${node}/conversations`
      return rescue(endpoint, async () => {
        const { data: response, headers } =
          await client.getWithHeaders<unknown>(endpoint, {
            headers: { Authorization: `Bearer ${accessToken}` },
            searchParams: {
              fields: "id,participants,updated_time",
              limit: String(PAGE_LIMIT),
              ...searchParams,
              ...(after ? { after } : {}),
            },
          })
        const page = graphPageSchema(conversationSchema).parse(response)
        return {
          data: page.data ?? [],
          after: nextCursor(page.paging),
          appUsage: parseAppUsageHeader(headers.get("x-app-usage")),
        }
      })
    },
    fetchContactProfile({ userId, accessToken, version }) {
      const apiVersion = version ?? defaultVersion
      const endpoint = `${apiVersion}/${userId}`
      return rescue(endpoint, async () => {
        const { data: response, headers } =
          await client.getWithHeaders<unknown>(endpoint, {
            headers: { Authorization: `Bearer ${accessToken}` },
            searchParams: { fields: "id,name,username" },
          })
        return {
          profile: contactProfileSchema.parse(response),
          appUsage: parseAppUsageHeader(headers.get("x-app-usage")),
        }
      })
    },
    fetchConversationMessages({ conversationId, accessToken, version, after }) {
      const apiVersion = version ?? defaultVersion
      const endpoint = `${apiVersion}/${conversationId}`
      // Paginate the NESTED `messages` edge with the field-level `.after(CURSOR)`
      // modifier. A top-level `after` param does NOT apply to a nested edge, so
      // it never advances — the same page returns forever and the caller's loop
      // never terminates. We deliberately do NOT set `.limit()` here: the
      // conversation `messages` edge caps its page size below our conversation
      // limit and rejects an oversized `.limit()`, so we use Meta's default page
      // size (the original working behavior) and let `.after()` walk the pages.
      const messagesEdge = `messages${
        after ? `.after(${after})` : ""
      }{id,created_time,from,to,message,attachments,is_unsupported}`
      return rescue(endpoint, async () => {
        const { data: response, headers } =
          await client.getWithHeaders<unknown>(endpoint, {
            headers: { Authorization: `Bearer ${accessToken}` },
            searchParams: { fields: messagesEdge },
          })
        const parsed = conversationMessagesSchema.parse(response)
        const messages = await hydrateMissingDetails({
          messages: parsed.messages?.data ?? [],
          accessToken,
          version: apiVersion,
        })
        return {
          data: messages,
          after: nextCursor(parsed.messages?.paging),
          appUsage: parseAppUsageHeader(headers.get("x-app-usage")),
        }
      })
    },
  }
}
