import type { ChannelPostManagementSort } from "@chatbotx.io/database/partials"
import type {
  ChannelPostManagementCursor,
  ChannelPostManagementFilters,
} from "@chatbotx.io/database/repositories"
import { type CsvCell, toCsvRow } from "@chatbotx.io/utils/csv"
import { BaseService } from "../base.service"
import { ChatbotXException, validationException } from "../errors"
import { messageUsageService } from "../message-usage/service"
import {
  channelPostCommentsService,
  MAX_COMMENTS_PAGE_SIZE,
  MAX_MERGE_VIEW_POSTS,
  type PostCommentCursor,
} from "./comments.service"
import {
  CHANNEL_POST_EXPORT_KINDS,
  type ChannelPostCommentExportKind,
  type ChannelPostExportKind,
  forbiddenException,
  mayExportKind,
  ROWS_HEADER,
} from "./export-kinds"
import {
  type ExportRow,
  keepEarliestRow,
  STORED_ROW_BUILDERS,
} from "./export-rows"
import {
  type ChannelPostManagementItem,
  channelPostManagementService,
} from "./management.service"

/** Most comments one export reads; a larger post is cut here and flagged `truncated`. */
export const MAX_EXPORT_ROWS = 20_000
/**
 * Longest one export may spend reading comments. The file is built inside the
 * request, so it stops here, whatever the row count, and is flagged `truncated`.
 */
export const EXPORT_TIME_BUDGET_MS = 20_000

/** Most posts one `rows` export writes; a longer list is cut here and flagged `truncated`. */
export const MAX_EXPORT_POST_ROWS = 5000
/** Posts read per list page of a `rows` export. */
const EXPORT_POST_PAGE_SIZE = 100
/** Longest excerpt of a post's text in a `rows` export. */
const POST_TEXT_EXCERPT_LENGTH = 200

export type ChannelPostExport = {
  csv: string
  fileName: string
  /** Data rows written, header excluded. */
  rowCount: number
  /** `true` when the read stopped at {@link MAX_EXPORT_ROWS} comments or {@link EXPORT_TIME_BUDGET_MS}. */
  truncated: boolean
}

type BuildExportInput = {
  /** May the caller see phone numbers and emails? `phones` and `emails` are refused without it. */
  canViewEmailAndPhone: boolean
  /** Narrows the `rows` export like the list does; `hasComments` defaults to the list's `true`. */
  filters?: Omit<ChannelPostManagementFilters, "hasComments"> & {
    hasComments?: boolean
  }
  kind: ChannelPostExportKind
  /** Required for the comment kinds; a `rows` export selects posts by `filters` instead. */
  postIds?: string[]
  search?: string
  /** Order of a `rows` export, as in the list (default `newest`). */
  sort?: ChannelPostManagementSort
  workspaceId: string
}

const WHITESPACE_RUN = /\s+/g

const excerptOf = (text: string | null): string => {
  const flat = (text ?? "").replace(WHITESPACE_RUN, " ").trim()
  return flat.length > POST_TEXT_EXCERPT_LENGTH
    ? `${flat.slice(0, POST_TEXT_EXCERPT_LENGTH - 1)}…`
    : flat
}

const postRow = (post: ChannelPostManagementItem): CsvCell[] => [
  post.publishedAt?.toISOString() ?? "",
  post.channel,
  post.inboxName,
  post.contentType ?? post.mediaType ?? "",
  excerptOf(post.caption),
  post.commentsCount,
  post.reactionsCount,
  post.sharesCount,
  post.phoneCommentsCount,
  post.topics.map((topic) => topic.name).join("; "),
  post.authorName ?? post.authorExternalId ?? "",
  post.permalink ?? "",
  post.externalPostId,
]

class ChannelPostExportService extends BaseService {
  /**
   * The comments of the given posts as a CSV: every comment (`comments`), or one
   * row per customer who left a phone number (`phones`). Comments are read page
   * by page through the same reader the comments window uses, so what is
   * exported is exactly what is listed. The posts, their threads and their
   * commenters are looked up once; each further page runs only the message
   * query. One page and the rows kept so far are held in memory, and the read
   * stops at {@link MAX_EXPORT_ROWS} comments or {@link EXPORT_TIME_BUDGET_MS}.
   *
   * A completed download consumes one message of the owner's quota, for the
   * session download and the public API alike: refused with a 429
   * `postMessageQuotaExceeded` before anything is read when none is left, and
   * charged once the file is fully built, right before it is returned. A
   * request that fails earlier charges nothing, and so does one whose read
   * came back partial (a message shard failed): that is a 503, never a file
   * missing comments.
   */
  async build(
    input: BuildExportInput,
    /** The clock the time budget is measured on; tests pass a fake one. */
    now: () => number = Date.now,
  ): Promise<ChannelPostExport> {
    const { canViewEmailAndPhone, search, workspaceId } = input
    if (input.kind === "rows") {
      return await this.buildRows(input, now)
    }
    const kind: ChannelPostCommentExportKind = input.kind
    if (input.filters) {
      throw validationException(
        "filters",
        "Filters select the posts of a posts-list export only.",
      )
    }
    const postIds = Array.from(new Set(input.postIds ?? []))
    if (postIds.length === 0 || postIds.length > MAX_MERGE_VIEW_POSTS) {
      throw validationException(
        "postIds",
        `Export between 1 and ${MAX_MERGE_VIEW_POSTS} posts.`,
      )
    }
    if (!mayExportKind(kind, canViewEmailAndPhone)) {
      // Never a partial file: without the permission there is nothing to list.
      throw forbiddenException()
    }

    await messageUsageService.assertRoom(workspaceId)

    const startedAt = now()
    const reader = await channelPostCommentsService.openReader({
      canViewEmailAndPhone,
      hasPhone: kind === "phones" ? true : undefined,
      includeAvatars: false,
      postIds,
      search,
      workspaceId,
    })
    const postLabel = new Map(
      reader.posts.map((post) => [
        post.id,
        post.caption || post.externalPostId,
      ]),
    )
    await reader.preloadCommenters()

    const rows: CsvCell[][] = []
    const keyedRows = new Map<string, ExportRow>()
    const buildRow = STORED_ROW_BUILDERS[kind]
    let scanned = 0
    let truncated = false
    let cursor: PostCommentCursor | undefined

    do {
      const page = await reader.readPage({
        cursor,
        limit: MAX_COMMENTS_PAGE_SIZE,
      })
      for (const comment of page.items) {
        if (scanned >= MAX_EXPORT_ROWS) {
          truncated = true
          break
        }
        scanned += 1
        const entry = buildRow(comment, {
          contactEmail: comment.author
            ? reader.commenterEmail(comment.author.id)
            : null,
          postLabel: postLabel.get(comment.postId) ?? comment.postId,
        })
        if (entry === null) {
          continue
        }
        if (entry.key === null) {
          rows.push(entry.row)
        } else {
          // Newest first: a later (older) comment of the same key replaces the
          // row, so it ends up holding the key's first comment.
          keepEarliestRow(keyedRows, { ...entry, key: entry.key })
        }
      }
      if (page.hasPartialResults) {
        // Never an incomplete file passed off as complete, and nothing charged.
        throw new ChatbotXException(
          "Some comments could not be read right now. Try the export again.",
          "postCommentsUnavailable",
          503,
        )
      }
      cursor = page.nextCursor
      if (
        truncated ||
        (cursor &&
          (scanned >= MAX_EXPORT_ROWS ||
            now() - startedAt >= EXPORT_TIME_BUDGET_MS))
      ) {
        truncated = true
        cursor = undefined
      }
    } while (cursor)

    const dataRows =
      kind === "comments"
        ? rows
        : Array.from(keyedRows.values(), (entry) => entry.row)
    const header = CHANNEL_POST_EXPORT_KINDS[kind].header
    const result: ChannelPostExport = {
      csv: [header, ...dataRows].map((row) => toCsvRow(row)).join(""),
      fileName: `post-${kind}-${new Date().toISOString().slice(0, 10)}.csv`,
      rowCount: dataRows.length,
      // The reader's thread cap hides commenters the loop never sees.
      truncated: truncated || reader.threadsCapped,
    }
    await messageUsageService.charge({ count: 1, workspaceId })
    return result
  }

  /**
   * The post list itself as a CSV, one row per post, for the list filters:
   * read page by page through the management list, so the file holds exactly
   * what the list shows. Stops at {@link MAX_EXPORT_POST_ROWS} posts or
   * {@link EXPORT_TIME_BUDGET_MS} and then flags `truncated`. Charged and
   * refused like the comment exports (one message, quota checked first).
   */
  private async buildRows(
    input: BuildExportInput,
    now: () => number,
  ): Promise<ChannelPostExport> {
    const { filters, sort = "newest", workspaceId } = input
    if (input.postIds?.length) {
      throw validationException(
        "postIds",
        "A posts-list export is selected by filters, not post ids.",
      )
    }
    await messageUsageService.assertRoom(workspaceId)

    const startedAt = now()
    const rows: CsvCell[][] = []
    let truncated = false
    let cursor: ChannelPostManagementCursor | undefined

    do {
      const page = await channelPostManagementService.list({
        cursor,
        filters: { ...filters, hasComments: filters?.hasComments ?? true },
        limit: Math.min(
          EXPORT_POST_PAGE_SIZE,
          MAX_EXPORT_POST_ROWS - rows.length,
        ),
        sort,
        workspaceId,
      })
      for (const post of page.items) {
        rows.push(postRow(post))
      }
      cursor = page.nextCursor
      if (
        cursor &&
        (rows.length >= MAX_EXPORT_POST_ROWS ||
          now() - startedAt >= EXPORT_TIME_BUDGET_MS)
      ) {
        truncated = true
        cursor = undefined
      }
    } while (cursor)

    const result: ChannelPostExport = {
      csv: [ROWS_HEADER, ...rows].map((row) => toCsvRow(row)).join(""),
      fileName: `post-rows-${new Date().toISOString().slice(0, 10)}.csv`,
      rowCount: rows.length,
      truncated,
    }
    await messageUsageService.charge({ count: 1, workspaceId })
    return result
  }
}

export const channelPostExportService = new ChannelPostExportService()
