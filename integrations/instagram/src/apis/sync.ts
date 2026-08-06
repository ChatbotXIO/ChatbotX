import { z } from "zod"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { instagramCoexistGraphClient } from "../lib/http-client"

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

export type InstagramParticipant = z.infer<typeof participantSchema>
export type InstagramHistoryAttachment = z.infer<typeof attachmentSchema>
export type InstagramHistoryMessage = z.infer<typeof messageDetailSchema>
export type InstagramConversation = z.infer<typeof conversationSchema>
export type InstagramAppUsage = z.infer<typeof appUsageSchema>

type GraphPage<T> = {
  data?: T[]
  paging?: { cursors?: { after?: string }; next?: string }
}

type PaginatedResult<T> = {
  data: T[]
  after?: string
  appUsage?: InstagramAppUsage | null
}

const nextCursor = (
  paging: GraphPage<unknown>["paging"],
): string | undefined => (paging?.next ? paging.cursors?.after : undefined)

const parseAppUsageHeader = (
  value: string | null,
): InstagramAppUsage | null => {
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

const hasInlineMessageDetails = (message: InstagramHistoryMessage): boolean =>
  Boolean(
    message.created_time ??
      message.from ??
      message.to ??
      message.message ??
      message.attachments,
  )

const shouldFetchMessageDetails = (
  messages: InstagramHistoryMessage[],
): boolean =>
  messages.length > 0 && messages.some((m) => !hasInlineMessageDetails(m))

const fetchMessageDetails = (props: {
  messageId: string
  accessToken: string
  version: string
}): Promise<InstagramHistoryMessage> => {
  const endpoint = `${props.version}/${props.messageId}`
  return rescue(endpoint, async () => {
    const response = await instagramCoexistGraphClient.get<unknown>(endpoint, {
      headers: { Authorization: `Bearer ${props.accessToken}` },
      searchParams: {
        fields: "id,created_time,from,to,message,attachments,is_unsupported",
      },
    })

    return messageDetailSchema.parse(response)
  })
}

const hydrateMissingDetails = async (props: {
  messages: InstagramHistoryMessage[]
  accessToken: string
  version: string
}): Promise<InstagramHistoryMessage[]> => {
  if (!shouldFetchMessageDetails(props.messages)) {
    return props.messages
  }

  const detailById = new Map<string, InstagramHistoryMessage>()
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
      // Detail lookups are documented as limited to the 20 most recent messages.
      // Keep the ref-only message; downstream import skips empty messages.
    }
  }

  return props.messages.map((message) => detailById.get(message.id) ?? message)
}

export const listInstagramConversations = (props: {
  igUserId: string
  accessToken: string
  version?: string
  after?: string
}): Promise<PaginatedResult<InstagramConversation>> => {
  const { igUserId, accessToken, version = DEFAULT_API_VERSION, after } = props
  const endpoint = `${version}/${igUserId}/conversations`

  return rescue(endpoint, async () => {
    const { data: response, headers } =
      await instagramCoexistGraphClient.getWithHeaders<unknown>(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        searchParams: {
          fields: "id,participants,updated_time",
          limit: String(PAGE_LIMIT),
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
}

export const fetchInstagramConversationMessages = (props: {
  conversationId: string
  accessToken: string
  version?: string
  after?: string
}): Promise<PaginatedResult<InstagramHistoryMessage>> => {
  const {
    conversationId,
    accessToken,
    version = DEFAULT_API_VERSION,
    after,
  } = props
  const endpoint = `${version}/${conversationId}`

  return rescue(endpoint, async () => {
    const { data: response, headers } =
      await instagramCoexistGraphClient.getWithHeaders<unknown>(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        searchParams: {
          fields:
            "messages{id,created_time,from,to,message,attachments,is_unsupported}",
          limit: String(PAGE_LIMIT),
          ...(after ? { after } : {}),
        },
      })

    const parsed = conversationMessagesSchema.parse(response)
    const messages = await hydrateMissingDetails({
      messages: parsed.messages?.data ?? [],
      accessToken,
      version,
    })

    return {
      data: messages,
      after: nextCursor(parsed.messages?.paging),
      appUsage: parseAppUsageHeader(headers.get("x-app-usage")),
    }
  })
}
