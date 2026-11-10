import { ImapFlow } from "imapflow"
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

export type ImapFetchResult = {
  messages: FetchedMail[]
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
  client.on("error", () => undefined)
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
          cursor: { uidValidity, lastUid: newestUid },
          hasMore: false,
        }
      }

      if (newestUid <= lastUid) {
        return {
          messages: [],
          cursor: { uidValidity, lastUid },
          hasMore: false,
        }
      }

      const messages: FetchedMail[] = []
      let hasMore = false
      // `N:*` always yields the newest message even when its UID < N: filter.
      for await (const message of client.fetch(
        `${lastUid + 1}:*`,
        { uid: true, source: { maxLength: MAX_RAW_SOURCE_BYTES } },
        { uid: true },
      )) {
        if (message.uid <= lastUid || !message.source) {
          continue
        }
        if (messages.length >= limit) {
          hasMore = true
          break
        }
        messages.push({ uid: message.uid, raw: message.source })
      }
      messages.sort((a, b) => a.uid - b.uid)

      return {
        messages,
        cursor: {
          uidValidity,
          lastUid: messages.at(-1)?.uid ?? lastUid,
        },
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
