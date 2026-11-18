import { ImapFlow } from "imapflow"
import { logger } from "../lib/logger"
import {
  IMAP_CONNECT_TIMEOUT_MS,
  MAX_MESSAGES_PER_POLL,
  MAX_RAW_SOURCE_BYTES,
} from "./constants"

export type ImapConnection = {
  host: string
  port: number
  username: string
  password: string
  mailbox: string
}

export type ImapCursor = {
  uidValidity: number | null
  lastUid: number | null
}

export type FetchedMail = { uid: number; raw: Buffer }

/** Mail the poll passed over for good: a retry could never import it. */
export type SkippedMail = { uid: number; size?: number }

export type RebaselineReason = "first-poll" | "uidvalidity-changed"

export type ImapFetchResult = {
  messages: FetchedMail[]
  /** Over the size cap or without a body; the cursor still moves past them. */
  skipped: SkippedMail[]
  /** Set when no history was trusted and the cursor was reset to "now". */
  rebaselined?: RebaselineReason
  /** The cursor to persist once the messages are safely enqueued. */
  cursor: { uidValidity: number; lastUid: number }
  /** More mail is waiting beyond the per-poll limit. */
  hasMore: boolean
}

const openClient = (connection: ImapConnection): ImapFlow => {
  const client = new ImapFlow({
    host: connection.host,
    port: connection.port,
    secure: connection.port === 993,
    auth: { user: connection.username, pass: connection.password },
    logger: false,
    connectionTimeout: IMAP_CONNECT_TIMEOUT_MS,
    greetingTimeout: IMAP_CONNECT_TIMEOUT_MS,
  })
  // imapflow emits socket errors as events; an unhandled one would crash the worker.
  client.on("error", (err: unknown) => {
    logger.warn({ err, host: connection.host }, "IMAP connection error")
  })
  return client
}

const closeQuietly = async (client: ImapFlow): Promise<void> => {
  try {
    await client.logout()
  } catch {
    client.close()
  }
}

/**
 * Reads mail newer than the cursor, oldest first, without touching flags.
 *
 * With no cursor (first poll) or a changed UIDVALIDITY the mailbox is
 * re-baselined at "now": nothing historical is imported and no old UID is
 * trusted. The returned cursor then points at the newest existing message.
 */
export const fetchNewMessages = async (props: {
  connection: ImapConnection
  cursor: ImapCursor
  limit?: number
}): Promise<ImapFetchResult> => {
  const { connection, cursor, limit = MAX_MESSAGES_PER_POLL } = props
  const client = openClient(connection)

  try {
    await client.connect()
    const lock = await client.getMailboxLock(connection.mailbox)
    try {
      const mailbox = client.mailbox
      if (!mailbox) {
        throw new Error("IMAP mailbox could not be opened")
      }
      const uidValidity = Number(mailbox.uidValidity)
      const newestUid = Math.max(0, mailbox.uidNext - 1)

      const { lastUid } = cursor
      if (cursor.uidValidity !== uidValidity || lastUid === null) {
        return {
          messages: [],
          skipped: [],
          rebaselined:
            lastUid === null || cursor.uidValidity === null
              ? "first-poll"
              : "uidvalidity-changed",
          cursor: { uidValidity, lastUid: newestUid },
          hasMore: false,
        }
      }

      if (newestUid <= lastUid) {
        return {
          messages: [],
          skipped: [],
          cursor: { uidValidity, lastUid },
          hasMore: false,
        }
      }

      const messages: FetchedMail[] = []
      const skipped: SkippedMail[] = []
      let hasMore = false
      // `N:*` always yields the newest message even when its UID < N: filter.
      for await (const message of client.fetch(
        `${lastUid + 1}:*`,
        { uid: true, size: true, source: { maxLength: MAX_RAW_SOURCE_BYTES } },
        { uid: true },
      )) {
        if (message.uid <= lastUid) {
          continue
        }
        if (messages.length >= limit) {
          hasMore = true
          break
        }
        // A truncated mail cannot be parsed, and re-fetching it never gets
        // smaller: skip it for good rather than stall the cursor on it.
        if (!message.source || (message.size ?? 0) > MAX_RAW_SOURCE_BYTES) {
          skipped.push({ uid: message.uid, size: message.size })
          continue
        }
        messages.push({ uid: message.uid, raw: message.source })
      }
      messages.sort((a, b) => a.uid - b.uid)

      const newestSeenUid = Math.max(
        lastUid,
        ...messages.map((mail) => mail.uid),
        ...skipped.map((mail) => mail.uid),
      )

      return {
        messages,
        skipped,
        cursor: { uidValidity, lastUid: newestSeenUid },
        hasMore,
      }
    } finally {
      lock.release()
    }
  } finally {
    await closeQuietly(client)
  }
}

/** Logs in and opens the mailbox; throws the provider's error when it cannot. */
export const verifyImapConnection = async (
  connection: ImapConnection,
): Promise<void> => {
  const client = openClient(connection)
  try {
    await client.connect()
    const lock = await client.getMailboxLock(connection.mailbox)
    lock.release()
  } finally {
    await closeQuietly(client)
  }
}
