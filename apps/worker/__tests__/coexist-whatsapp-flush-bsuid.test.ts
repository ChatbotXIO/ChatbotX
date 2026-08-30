import { describe, expect, test } from "vitest"
import { extractFromValue } from "../src/heavy/handlers/coexist/whatsapp-flush"

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
  test("unrecognized shape: returns the empty result, no throw", () => {
    expect(extractFromValue("not-an-object")).toEqual({
      entries: [],
      mediaFollowUps: [],
      edits: [],
      revokes: [],
      declined: false,
      metadata: null,
    })
  })
})
