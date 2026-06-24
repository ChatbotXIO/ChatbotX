import { extractContactInfo } from "@chatbotx.io/business"
import {
  listMessages,
  type MessengerHistoryAttachment,
  type MessengerHistoryMessage,
} from "@chatbotx.io/integration-messenger/apis/sync"
import type { BucUsage } from "@chatbotx.io/integration-messenger/apis/usage"
import {
  guessFileTypeFromMimeType,
  type IncomingAttachment,
  type MessageButtonTemplate,
  type MessageTemplateEntity,
} from "@chatbotx.io/sdk"
import { logger } from "../../../lib/logger"
import type { HistoricalMessage } from "./bulk-historical-import"

/**
 * Convert one Graph attachment into the SDK shape.
 *
 * `originPath` is intentionally the upstream Facebook CDN URL — the historical
 * importer inserts it as-is, and a follow-up `coexistAttachmentDownload` job
 * mirrors the bytes to object storage and rewrites this column to the S3 path.
 * Returns null when no usable URL is present (placeholder attachments with no
 * `image_data.url` / `video_data.url` / `file_url`).
 */
const toIncomingAttachment = (
  raw: MessengerHistoryAttachment,
): IncomingAttachment | null => {
  const url = raw.image_data?.url ?? raw.video_data?.url ?? raw.file_url ?? null
  if (!url) {
    return null
  }
  const mimeType = raw.mime_type ?? "application/octet-stream"
  const dims = raw.image_data ?? raw.video_data
  return {
    sourceId: raw.id,
    fileType: guessFileTypeFromMimeType(mimeType),
    mimeType,
    originPath: url,
    size: raw.size ?? 0,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    name: raw.name,
  }
}

const extractAttachments = (
  raw: MessengerHistoryMessage,
): IncomingAttachment[] => {
  const data = raw.attachments?.data ?? []
  const out: IncomingAttachment[] = []
  for (const att of data) {
    const incoming = toIncomingAttachment(att)
    if (incoming) {
      out.push(incoming)
    }
  }
  return out
}

/**
 * A Page button-template message (`generic_template`) carries a text title plus
 * a list of call-to-action buttons — not a media URL. We persist it as a text
 * message (`contentType: "text"`, text = title) with the buttons in
 * `contentAttributes` so the inbox renders text + buttons (the same shape used
 * by outgoing Messenger templates). Returns null when there is no template.
 */
const extractButtonTemplate = (
  raw: MessengerHistoryMessage,
): { text: string; contentAttributes: MessageTemplateEntity } | null => {
  const data = raw.attachments?.data ?? []
  for (const att of data) {
    const template = att.generic_template
    if (!template) {
      continue
    }
    const ctas = template.cta ?? []
    const buttons: MessageButtonTemplate[] = ctas.map((cta, index) => {
      const id = `${att.id}-${index}`
      const label = cta.title ?? ""
      if (cta.type === "web_url" && cta.url) {
        return { id, label, buttonType: "url", url: cta.url }
      }
      // Graph omits the postback payload for historical templates; the button is
      // display-only here, so an empty payload is sufficient.
      return { id, label, buttonType: "postback", postback: "" }
    })
    return {
      text: template.title ?? "",
      contentAttributes: {
        type: "template",
        payload: { templateType: "button", buttons },
      },
    }
  }
  return null
}

const parseApiDate = (value: string | undefined): Date | undefined => {
  if (!value) {
    return
  }
  const date = new Date(value)
  if (Number.isFinite(date.getTime())) {
    return date
  }
}

/** Maximum inline retry attempts on 429 / 5xx before propagating. */
export const MAX_INLINE_RETRIES = 4

/**
 * Only store messages whose `created_time` is within this window. Older
 * messages are still scanned for phone/email discovery but not persisted.
 * 90 days ≈ 3 months — matches the product spec.
 */
export const STORE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

/**
 * Maximum number of message pages to scan beyond the 3-month storage window
 * purely for phone/email discovery. Prevents unbounded Graph API calls when
 * a conversation never contains extractable contact info.
 */
export const MAX_DISCOVERY_PAGES = 10

/** Returns true if the error is an HTTP status we should retry inline. */
export function isRetryable(error: unknown): boolean {
  if (
    error != null &&
    typeof error === "object" &&
    "response" in error &&
    error.response != null &&
    typeof error.response === "object" &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    const status = error.response.status
    return status === 429 || status >= 500
  }
  return false
}

/**
 * Wraps a Graph API call with inline retry on 429 / 5xx. Preserves the
 * pagination cursor across retries — unlike a BullMQ-level retry which would
 * restart the entire job from scratch.
 */
export async function withInlineRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_INLINE_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryable(error)) {
        throw error
      }
      const delay = Math.min(2 ** attempt * 1000, 30_000)
      logger.warn(
        { attempt, delay },
        "[coexist] Messenger Graph rate-limited — retrying after delay",
      )
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastError
}

const WHITESPACE_RE = /\s+/

/**
 * Split a Messenger participant `name` ("Bob Customer") into firstName +
 * lastName. First whitespace token = firstName, remainder = lastName.
 */
export const splitName = (
  raw: string | undefined,
): { firstName?: string; lastName?: string } => {
  const trimmed = raw?.trim()
  if (!trimmed) {
    return {}
  }
  const idx = trimmed.search(WHITESPACE_RE)
  if (idx < 0) {
    return { firstName: trimmed }
  }
  return {
    firstName: trimmed.slice(0, idx),
    lastName: trimmed.slice(idx).trim() || undefined,
  }
}

export type FetchConvMessagesResult = {
  /** Always empty when `onPage` is provided — messages are flushed per page. */
  messages: HistoricalMessage[]
  discovered: { phoneNumber?: string; email?: string }
}

/**
 * Called after each Graph `/messages` page with the messages collected from
 * that page. `discovered` is the live contact-enrichment object mutated by
 * all pages so far — callers may read it inside the callback. Allows the
 * caller to flush to the database incrementally, preventing unbounded
 * in-memory accumulation across many pages.
 */
export type OnMessagePageFn = (
  messages: HistoricalMessage[],
  discovered: { phoneNumber?: string; email?: string },
) => Promise<void>

/**
 * Walk `/messages` for one Messenger conversation, paginating with the Graph
 * `after` cursor. Applies three filters:
 *
 *  - `ceiling` (cross-run boundary): messages with `created_time <= ceiling`
 *    were imported by a previous successful run; skipped from both storage
 *    and discovery. Setting `hitOlderBoundary=true` enables the discovery
 *    pagination budget.
 *  - `cutoff` (per-conv 3-month boundary): messages older than cutoff are
 *    skipped from storage but still scanned for phone/email discovery
 *    until `MAX_DISCOVERY_PAGES` is hit or both fields are found.
 *  - `totalMsg <= 100`: keep at least the 100 most recent regardless of
 *    cutoff — a brand-new conversation with no recent activity should still
 *    surface in the inbox UI.
 *
 * When `onPage` is provided, `messages` from each Graph page are flushed via
 * that callback immediately and the returned `messages` array is always empty.
 * When omitted (backward-compat), messages accumulate into the returned array.
 *
 * Discovery uses libphonenumber and basic email regex via
 * `extractContactInfo`. Once a field is found we skip its extractor on every
 * subsequent message to avoid the dominant CPU cost.
 */
export const fetchConvMessages = async (props: {
  conversationId: string
  accessToken: string
  version?: string
  cutoff: Date
  ceiling: Date | null
  pageId: string
  defaultCountry: string | null
  applyBucThrottle: (usage: BucUsage | null | undefined) => void
  respectPause: () => Promise<void>
  /** Optional per-page flush callback — called once per Graph page. */
  onPage?: OnMessagePageFn
}): Promise<FetchConvMessagesResult> => {
  const {
    conversationId,
    accessToken,
    version,
    cutoff,
    ceiling,
    pageId,
    defaultCountry,
    applyBucThrottle,
    respectPause,
    onPage,
  } = props

  const messages: HistoricalMessage[] = []
  const discovered: { phoneNumber?: string; email?: string } = {}
  let messageCursor: string | undefined
  let hitOlderBoundary = false
  let discoveryPages = 0
  let totalMsg = 0

  while (true) {
    await respectPause()
    const page = await withInlineRetry(() =>
      listMessages({
        conversationId,
        accessToken,
        version,
        after: messageCursor,
      }),
    )
    applyBucThrottle(page.bucUsage)

    // Collect messages for this page only; flush or accumulate below.
    const pageMessages: HistoricalMessage[] = []

    for (const m of page.data as MessengerHistoryMessage[]) {
      const attachments = extractAttachments(m)
      const buttonTemplate = extractButtonTemplate(m)
      // Empty placeholder rows (no text + no usable attachment URL + no button
      // template) carry no signal — skip to avoid emitting a row that
      // bulkImportMessages would then reject for being effectively empty.
      if (!m.message && attachments.length === 0 && !buttonTemplate) {
        continue
      }
      totalMsg++
      const createdAt = parseApiDate(m.created_time)

      if (createdAt && ceiling && createdAt <= ceiling) {
        hitOlderBoundary = true
        continue
      }

      if (m.message) {
        const needsPhone = !discovered.phoneNumber
        const needsEmail = !discovered.email
        if (needsPhone || needsEmail) {
          const ex = extractContactInfo(m.message, defaultCountry, {
            skipPhone: !needsPhone,
            skipEmail: !needsEmail,
          })
          if (ex.phoneNumber && needsPhone) {
            discovered.phoneNumber = ex.phoneNumber
          }
          if (ex.email && needsEmail) {
            discovered.email = ex.email
          }
        }
      }

      if (!createdAt || createdAt >= cutoff || totalMsg <= 100) {
        pageMessages.push({
          sourceId: m.id,
          messageType: m.from?.id === pageId ? "outgoing" : "incoming",
          contentType: "text",
          text: m.message || buttonTemplate?.text || "",
          createdAt,
          ...(attachments.length > 0 ? { attachments } : {}),
          ...(buttonTemplate
            ? { contentAttributes: buttonTemplate.contentAttributes }
            : {}),
        })
      } else {
        hitOlderBoundary = true
      }
    }

    // Flush this page's messages: either via the per-page callback (M3) or
    // accumulate into the return array for callers that don't provide onPage.
    if (onPage) {
      await onPage(pageMessages, discovered)
    } else {
      for (const msg of pageMessages) {
        messages.push(msg)
      }
    }

    messageCursor = page.after
    if (!messageCursor) {
      break
    }

    if (hitOlderBoundary) {
      discoveryPages += 1
      if (
        (discovered.phoneNumber && discovered.email) ||
        discoveryPages >= MAX_DISCOVERY_PAGES
      ) {
        break
      }
    }
  }

  return { messages, discovered }
}
