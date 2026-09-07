import { describe, expect, test } from "vitest"
import { extractFromValue } from "../src/integration/handlers/coexist/whatsapp-flush"
import { reduceMetadata } from "../src/integration/handlers/coexist/whatsapp-history-payload"

// ---------------------------------------------------------------------------
// WhatsApp Coexistence — BSUID/username extraction (D7, P7)
//
// `extractFromValue` is a pure function; the full `coexistWhatsappFlush`
// orchestration (DB, bulk import, run-state machine) is covered by
// coexist-whatsapp-flush.test.ts. These tests pin the field-mapping and
// empty-wa_id fallback behavior added for WhatsApp Usernames adopters.
// ---------------------------------------------------------------------------

describe("extractFromValue — threads (history)", () => {
  test("classic payload (phone, no username): regression — unchanged rows, no new columns", () => {
    const result = extractFromValue({
      contacts: [{ wa_id: "84900000001", profile: { name: "Alice" } }],
      history: [
        {
          threads: [
            {
              id: "84900000001",
              messages: [
                { id: "wamid.1", from: "84900000001", text: { body: "hi" } },
              ],
            },
          ],
        },
      ],
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.contact).toEqual(
      expect.objectContaining({
        sourceId: "84900000001",
        phoneNumber: "84900000001",
        firstName: "Alice",
      }),
    )
    expect(result.entries[0]?.contact.sourceUserId).toBeUndefined()
    expect(result.entries[0]?.message?.messageType).toBe("incoming")
  })

  test("adopter with hidden phone (empty thread id): keys on the BSUID instead of skipping the thread", () => {
    const result = extractFromValue({
      contacts: [
        {
          wa_id: "",
          user_id: "user.9373001",
          profile: { username: "@handle" },
        },
      ],
      history: [
        {
          threads: [
            {
              id: "",
              user_id: "user.9373001",
              messages: [
                {
                  id: "wamid.2",
                  from: "",
                  from_user_id: "user.9373001",
                  text: { body: "hi from adopter" },
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.contact).toEqual(
      expect.objectContaining({
        sourceId: "user.9373001",
        sourceUserId: "user.9373001",
        sourceUsername: "@handle",
      }),
    )
    // Never a phone — BSUID must not leak into phoneNumber.
    expect(result.entries[0]?.contact.phoneNumber).toBeUndefined()
    // Incoming: from_user_id matches the thread's own scoped user id.
    expect(result.entries[0]?.message?.messageType).toBe("incoming")
  })

  test("adopter thread: a business-sent message (from_user_id differs from the thread's scoped user id) is outgoing", () => {
    const result = extractFromValue({
      contacts: [{ wa_id: "", user_id: "user.9373002" }],
      history: [
        {
          threads: [
            {
              id: "",
              user_id: "user.9373002",
              messages: [
                {
                  id: "wamid.3",
                  from: "",
                  from_user_id: "user.business-owned-id",
                  text: { body: "business reply" },
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result.entries[0]?.message?.messageType).toBe("outgoing")
  })

  test("adopter thread: a message with neither `from` nor `from_user_id` is ambiguous — defaults to incoming (conservative)", () => {
    const result = extractFromValue({
      contacts: [{ wa_id: "", user_id: "user.9373002" }],
      history: [
        {
          threads: [
            {
              id: "",
              user_id: "user.9373002",
              messages: [
                {
                  id: "wamid.3b",
                  from: "",
                  from_user_id: "",
                  text: { body: "ambiguous" },
                },
              ],
            },
          ],
        },
      ],
    })

    expect(result.entries[0]?.message?.messageType).toBe("incoming")
  })

  test("phone visible + BSUID present: phone-keyed row, sourceUserId still captured for backfill", () => {
    const result = extractFromValue({
      contacts: [{ wa_id: "84900000003", user_id: "user.9373003" }],
      history: [
        {
          threads: [
            {
              id: "84900000003",
              messages: [
                { id: "wamid.4", from: "84900000003", text: { body: "hi" } },
              ],
            },
          ],
        },
      ],
    })

    expect(result.entries[0]?.contact).toEqual(
      expect.objectContaining({
        sourceId: "84900000003",
        phoneNumber: "84900000003",
        sourceUserId: "user.9373003",
      }),
    )
  })
})

describe("extractFromValue — message_echoes (outgoing SMB app messages)", () => {
  test("classic echo: regression — keyed on the recipient phone", () => {
    const result = extractFromValue({
      smb_message_echoes: [
        {
          from: "phone-number-id-1",
          to: "84900000005",
          id: "wamid.echo-1",
          text: { body: "reply from app" },
        },
      ],
    })

    expect(result.entries[0]?.contact.sourceId).toBe("84900000005")
    expect(result.entries[0]?.message?.messageType).toBe("outgoing")
  })

  test("echo to an adopter with hidden phone: keys on to_user_id instead of skipping", () => {
    const result = extractFromValue({
      smb_message_echoes: [
        {
          from: "phone-number-id-1",
          to: "",
          to_user_id: "user.9373004",
          id: "wamid.echo-2",
          text: { body: "reply from app" },
        },
      ],
    })

    expect(result.entries[0]?.contact).toEqual(
      expect.objectContaining({
        sourceId: "user.9373004",
        sourceUserId: "user.9373004",
      }),
    )
    expect(result.entries[0]?.contact.phoneNumber).toBeUndefined()
  })
})

describe("extractFromValue — edits/revokes/media follow-ups (value.messages[])", () => {
  test("revoke from an adopter with hidden phone: keys the patch on from_user_id", () => {
    const result = extractFromValue({
      messages: [
        {
          id: "wamid.revoke-1",
          from: "",
          from_user_id: "user.9373005",
          type: "revoke",
          revoke: { original_message_id: "wamid.original-1" },
        },
      ],
    })

    expect(result.revokes).toEqual([
      { sourceId: "wamid.original-1", contactWaId: "user.9373005" },
    ])
  })

  test("edit from an adopter with hidden phone: keys the patch on from_user_id", () => {
    const result = extractFromValue({
      messages: [
        {
          id: "wamid.edit-1",
          from: "",
          from_user_id: "user.9373006",
          type: "edit",
          edit: {
            original_message_id: "wamid.original-2",
            message: { text: { body: "edited text" } },
          },
        },
      ],
    })

    expect(result.edits).toEqual([
      {
        sourceId: "wamid.original-2",
        contactWaId: "user.9373006",
        text: "edited text",
        attachment: null,
      },
    ])
  })

  test("media follow-up from an adopter with hidden phone: keys on from_user_id", () => {
    const result = extractFromValue({
      messages: [
        {
          id: "wamid.media-1",
          from: "",
          from_user_id: "user.9373007",
          image: { id: "media-id-1", mime_type: "image/jpeg" },
        },
      ],
    })

    expect(result.mediaFollowUps).toEqual([
      {
        sourceId: "wamid.media-1",
        contactWaId: "user.9373007",
        attachment: expect.objectContaining({ sourceId: "media-id-1" }),
      },
    ])
  })
})

describe("extractFromValue — malformed payload", () => {
  // Updated for brief-coexist-history-lifecycle.md §E: an unparseable payload
  // still yields the empty result and never throws, but now REPORTS the parse
  // failure so the flush can park the staging row with `parseFailedAt` instead
  // of marking it processed and losing the data silently.
  test("unrecognized shape: returns the empty result flagged as parse-failed, no throw", () => {
    expect(extractFromValue("not-an-object")).toEqual({
      entries: [],
      mediaFollowUps: [],
      edits: [],
      revokes: [],
      declined: false,
      metadata: null,
      metadataEntries: [],
      parseFailed: true,
    })
  })

  // The terminal signal is evaluated per entry, so every metadata
  // entry must survive extraction — not just the (progress, chunkOrder) best.
  test("every history metadata entry is reported, not only the reduced one", () => {
    const result = extractFromValue({
      history: [
        { metadata: { phase: 0, chunk_order: 1, progress: 100 } },
        { metadata: { phase: 2, chunk_order: 1, progress: 100 } },
      ],
    })

    expect(result.metadataEntries.map((entry) => entry.phase)).toEqual([0, 2])
    // The reduction is lexicographic by (phase, progress, chunkOrder), so it
    // keeps the furthest phase. The per-entry terminal check does
    // not depend on it either way.
    expect(result.metadata?.phase).toBe(2)
  })

  test("a well-formed payload is not flagged as parse-failed", () => {
    expect(extractFromValue({ contacts: [] }).parseFailed).toBe(false)
  })
})

// The persisted (lastPhase, syncProgress) pair is the ONLY memory of
// how far Meta got, across flush invocations. Reducing by progress alone paired
// the max phase with some other phase's progress and read "phase 2 @ 100" out of
// `p0@100 + p2@40`. Lexicographic (phase, progress, chunkOrder) makes the pair an
// exact encoding: furthest phase, and that phase's own progress.
describe("reduceMetadata", () => {
  const m = (phase: number, progress: number, chunkOrder: number) => ({
    phase,
    chunkOrder,
    progress,
  })

  test("a higher phase wins even when its progress is lower", () => {
    expect(reduceMetadata(m(0, 100, 1), m(2, 40, 1))).toEqual(m(2, 40, 1))
  })

  test("a lower phase never displaces a higher one", () => {
    expect(reduceMetadata(m(2, 40, 1), m(0, 100, 9))).toEqual(m(2, 40, 1))
  })

  test("within one phase, higher progress wins", () => {
    expect(reduceMetadata(m(1, 80, 5), m(1, 10, 6))).toEqual(m(1, 80, 5))
    expect(reduceMetadata(m(1, 10, 6), m(1, 80, 5))).toEqual(m(1, 80, 5))
  })

  test("within one phase and progress, higher chunkOrder wins", () => {
    expect(reduceMetadata(m(1, 80, 5), m(1, 80, 6))).toEqual(m(1, 80, 6))
    expect(reduceMetadata(m(1, 80, 6), m(1, 80, 5))).toEqual(m(1, 80, 6))
  })

  test("seeds from null", () => {
    expect(reduceMetadata(null, m(0, 100, 1))).toEqual(m(0, 100, 1))
  })

  test("the live triple reduces to the terminal pair", () => {
    const reduced = [
      m(0, 100, 1),
      m(1, 100, 1),
      m(2, 100, 1),
    ].reduce<ReturnType<typeof m> | null>(
      (acc, next) => reduceMetadata(acc, next),
      null,
    )
    expect(reduced).toEqual(m(2, 100, 1))
  })
})
