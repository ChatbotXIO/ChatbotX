import { beforeEach, describe, expect, test, vi } from "vitest"

type FakeMessage = { uid: number; source?: Buffer }

const state = vi.hoisted(() => ({
  mailbox: { uidValidity: 100n, uidNext: 11 } as {
    uidValidity: bigint
    uidNext: number
  },
  messages: [] as FakeMessage[],
  connectError: null as Error | null,
  fetchRange: "",
  lockReleased: false,
  loggedOut: false,
}))

vi.mock("imapflow", () => ({
  ImapFlow: class {
    mailbox = state.mailbox
    on() {
      return this
    }
    connect() {
      return state.connectError
        ? Promise.reject(state.connectError)
        : Promise.resolve()
    }
    getMailboxLock() {
      return Promise.resolve({
        release: () => {
          state.lockReleased = true
        },
      })
    }
    fetch(range: string) {
      state.fetchRange = range
      return (function* () {
        yield* state.messages
      })()
    }
    logout() {
      state.loggedOut = true
      return Promise.resolve()
    }
    close() {
      state.loggedOut = true
    }
  },
}))

import { fetchNewMessages, verifyImapConnection } from "../src/inbound/imap"

const connection = {
  host: "imap.test",
  port: 993,
  username: "u",
  password: "p",
  mailbox: "INBOX",
}
const raw = (uid: number) => Buffer.from(`mail ${uid}`)

beforeEach(() => {
  state.mailbox = { uidValidity: 100n, uidNext: 11 }
  state.messages = []
  state.connectError = null
  state.fetchRange = ""
  state.lockReleased = false
  state.loggedOut = false
})

describe("fetchNewMessages", () => {
  test("first poll baselines at the newest UID and imports nothing historical", async () => {
    state.messages = [{ uid: 9, source: raw(9) }]

    const result = await fetchNewMessages({
      connection,
      cursor: { uidValidity: null, lastUid: null },
    })

    expect(result.messages).toEqual([])
    expect(result.cursor).toEqual({ uidValidity: 100, lastUid: 10 })
    expect(state.fetchRange).toBe("")
  })

  test("a changed UIDVALIDITY re-baselines instead of trusting the old UID", async () => {
    const result = await fetchNewMessages({
      connection,
      cursor: { uidValidity: 55, lastUid: 4 },
    })

    expect(result.messages).toEqual([])
    expect(result.cursor).toEqual({ uidValidity: 100, lastUid: 10 })
  })

  test("returns nothing and keeps the cursor when there is no new mail", async () => {
    const result = await fetchNewMessages({
      connection,
      cursor: { uidValidity: 100, lastUid: 10 },
    })

    expect(result).toEqual({
      messages: [],
      cursor: { uidValidity: 100, lastUid: 10 },
      hasMore: false,
    })
    expect(state.fetchRange).toBe("")
  })

  test("fetches UIDs after the cursor, skips the always-returned older one, and advances the cursor", async () => {
    state.mailbox = { uidValidity: 100n, uidNext: 13 }
    // `N:*` returns the newest message even when it is <= the cursor.
    state.messages = [
      { uid: 10, source: raw(10) },
      { uid: 11, source: raw(11) },
      { uid: 12, source: raw(12) },
    ]

    const result = await fetchNewMessages({
      connection,
      cursor: { uidValidity: 100, lastUid: 10 },
    })

    expect(state.fetchRange).toBe("11:*")
    expect(result.messages.map((m) => m.uid)).toEqual([11, 12])
    expect(result.cursor).toEqual({ uidValidity: 100, lastUid: 12 })
    expect(result.hasMore).toBe(false)
  })

  test("caps one poll at the limit, advances only past what it returned and reports more", async () => {
    state.mailbox = { uidValidity: 100n, uidNext: 16 }
    state.messages = [11, 12, 13, 14, 15].map((uid) => ({
      uid,
      source: raw(uid),
    }))

    const result = await fetchNewMessages({
      connection,
      cursor: { uidValidity: 100, lastUid: 10 },
      limit: 2,
    })

    expect(result.messages.map((m) => m.uid)).toEqual([11, 12])
    expect(result.cursor.lastUid).toBe(12)
    expect(result.hasMore).toBe(true)
  })

  test("skips a message with no source without moving the cursor past it", async () => {
    state.mailbox = { uidValidity: 100n, uidNext: 13 }
    state.messages = [{ uid: 11 }, { uid: 12, source: raw(12) }]

    const result = await fetchNewMessages({
      connection,
      cursor: { uidValidity: 100, lastUid: 10 },
    })

    expect(result.messages.map((m) => m.uid)).toEqual([12])
  })

  test("releases the mailbox lock and logs out on success", async () => {
    await fetchNewMessages({
      connection,
      cursor: { uidValidity: 100, lastUid: 10 },
    })

    expect(state.lockReleased).toBe(true)
    expect(state.loggedOut).toBe(true)
  })

  test("propagates a login failure and still closes the client", async () => {
    state.connectError = new Error("AUTHENTICATIONFAILED")

    await expect(
      fetchNewMessages({
        connection,
        cursor: { uidValidity: 100, lastUid: 10 },
      }),
    ).rejects.toThrow("AUTHENTICATIONFAILED")
    expect(state.loggedOut).toBe(true)
  })
})

describe("verifyImapConnection", () => {
  test("opens and releases the mailbox", async () => {
    await verifyImapConnection(connection)
    expect(state.lockReleased).toBe(true)
    expect(state.loggedOut).toBe(true)
  })

  test("throws when login fails", async () => {
    state.connectError = new Error("bad credentials")
    await expect(verifyImapConnection(connection)).rejects.toThrow(
      "bad credentials",
    )
  })
})
