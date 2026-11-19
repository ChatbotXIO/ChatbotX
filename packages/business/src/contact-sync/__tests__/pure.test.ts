import { describe, expect, test } from "vitest"
import { resolveContactSyncAvailability } from "../availability"
import { CONTACT_SYNC_COOLDOWN_MS } from "../constants"
import { externalFieldTypeTargets, isCompatibleFieldType } from "../field-type"
import {
  buildContactSyncProfile,
  resolveContactSyncIdentity,
} from "../profile-fields"
import type { ContactSyncRecord } from "../types"

const now = new Date("2026-11-16T10:00:00Z")

const record = (patch: Partial<ContactSyncRecord> = {}): ContactSyncRecord => ({
  externalId: "1",
  channelUserId: "psid-1",
  scopedUserId: null,
  firstName: null,
  lastName: null,
  fullName: null,
  gender: null,
  locale: null,
  timezoneOffsetHours: null,
  avatarUrl: null,
  phone: null,
  email: null,
  ref: null,
  country: null,
  state: null,
  city: null,
  location: null,
  tags: [],
  fieldValues: [],
  ...patch,
})

const vn = { targetCountry: "VN" }

describe("resolveContactSyncAvailability", () => {
  test("a live run blocks and is reported", () => {
    expect(
      resolveContactSyncAvailability({
        liveRunId: "run-1",
        latestFetchedRunCreatedAt: null,
        now,
      }),
    ).toEqual({
      canSync: false,
      blockedReason: "running",
      nextSyncAt: null,
      activeRunId: "run-1",
    })
  })

  test("a workspace that never synced can sync", () => {
    expect(
      resolveContactSyncAvailability({
        liveRunId: null,
        latestFetchedRunCreatedAt: null,
        now,
      }).canSync,
    ).toBe(true)
  })

  test("blocks until exactly four hours after the last run that reached its source", () => {
    const createdAt = new Date(now.getTime() - CONTACT_SYNC_COOLDOWN_MS + 1)
    const blocked = resolveContactSyncAvailability({
      liveRunId: null,
      latestFetchedRunCreatedAt: createdAt,
      now,
    })
    expect(blocked).toMatchObject({ canSync: false, blockedReason: "cooldown" })
    expect(blocked.nextSyncAt?.getTime()).toBe(now.getTime() + 1)

    expect(
      resolveContactSyncAvailability({
        liveRunId: null,
        latestFetchedRunCreatedAt: new Date(
          now.getTime() - CONTACT_SYNC_COOLDOWN_MS,
        ),
        now,
      }).canSync,
    ).toBe(true)
  })
})

describe("externalFieldTypeTargets", () => {
  test("every source type defaults to a type it is compatible with", () => {
    for (const [type, target] of Object.entries(externalFieldTypeTargets)) {
      expect(
        isCompatibleFieldType(
          type as keyof typeof externalFieldTypeTargets,
          target.default,
        ),
      ).toBe(true)
    }
  })

  test("a different type is not compatible", () => {
    expect(isCompatibleFieldType("number", "shortText")).toBe(false)
    expect(isCompatibleFieldType("text", "email")).toBe(true)
    expect(isCompatibleFieldType("json", "longText")).toBe(true)
  })
})

describe("buildContactSyncProfile", () => {
  test("normalizes every basic field the source supplies", () => {
    expect(
      buildContactSyncProfile(
        record({
          firstName: " An ",
          lastName: "Nguyen",
          gender: "MALE",
          phone: "0901234567",
          email: "An@Example.com",
          avatarUrl: "https://cdn.example.com/a.jpg",
          locale: "vi_VN",
          timezoneOffsetHours: 7,
          ref: " summer ",
          country: "Vietnam",
          state: "HCM",
          city: "Thu Duc",
          location: { latitude: 10.8, longitude: 106.7 },
        }),
        vn,
      ),
    ).toEqual({
      firstName: "An",
      lastName: "Nguyen",
      gender: "male",
      phoneNumber: "+84901234567",
      email: "an@example.com",
      avatar: "https://cdn.example.com/a.jpg",
      locale: "vi_VN",
      timezone: "+07:00",
      ref: "summer",
      country: "Vietnam",
      state: "HCM",
      city: "Thu Duc",
      location: { latitude: 10.8, longitude: 106.7 },
    })
  })

  test("drops invalid or empty values instead of guessing", () => {
    expect(
      buildContactSyncProfile(
        record({
          firstName: "  ",
          gender: "other",
          phone: "not a phone",
          email: "nope",
          avatarUrl: "https://user:pass@cdn.example.com/a.jpg",
          location: { latitude: 120, longitude: 0 },
        }),
        vn,
      ),
    ).toEqual({})
  })

  test("uses the full name as first name only when no split name exists", () => {
    expect(
      buildContactSyncProfile(record({ fullName: "An Nguyen" }), vn),
    ).toEqual({ firstName: "An Nguyen" })
    expect(
      buildContactSyncProfile(
        record({ fullName: "An Nguyen", lastName: "Nguyen" }),
        vn,
      ),
    ).toEqual({ lastName: "Nguyen" })
  })

  test("refuses a plain-http avatar", () => {
    expect(
      buildContactSyncProfile(
        record({ avatarUrl: "http://cdn.example.com/a.jpg" }),
        vn,
      ),
    ).toEqual({})
  })

  test("cuts free-text columns to 255 characters", () => {
    expect(
      buildContactSyncProfile(record({ ref: "r".repeat(300) }), vn).ref,
    ).toHaveLength(255)
  })

  test("drops an email over the limit instead of cutting it into another address", () => {
    // Cut to 100 characters this would end in ".co", still a valid address.
    const email = `${"a".repeat(89)}@example.com`

    expect(email).toHaveLength(101)
    expect(buildContactSyncProfile(record({ email }), vn).email).toBeUndefined()
  })

  test("cuts names to the create-form limit", () => {
    expect(
      buildContactSyncProfile(record({ firstName: "a".repeat(150) }), vn)
        .firstName,
    ).toHaveLength(100)
  })

  test("a local phone needs the workspace country", () => {
    expect(
      buildContactSyncProfile(record({ phone: "0901234567" }), {
        targetCountry: null,
      }).phoneNumber,
    ).toBeUndefined()
  })
})

describe("resolveContactSyncIdentity", () => {
  test.each([
    ["messenger", "psid-1"],
    ["instagram", "igsid-1"],
    ["zalo", "zalo-1"],
  ] as const)("%s keys on the channel user id", (channel, id) => {
    expect(
      resolveContactSyncIdentity(record({ channelUserId: id }), channel, vn),
    ).toEqual({ sourceId: id })
  })

  test("a record without an identity cannot be imported", () => {
    expect(
      resolveContactSyncIdentity(
        record({ channelUserId: null }),
        "messenger",
        vn,
      ),
    ).toBeNull()
  })

  test("telegram group chats (negative ids) are skipped", () => {
    expect(
      resolveContactSyncIdentity(
        record({ channelUserId: "-100123" }),
        "telegram",
        vn,
      ),
    ).toBeNull()
    expect(
      resolveContactSyncIdentity(
        record({ channelUserId: "123456" }),
        "telegram",
        vn,
      ),
    ).toEqual({ sourceId: "123456" })
  })

  test("whatsapp is not imported from AhaChat", () => {
    expect(
      resolveContactSyncIdentity(
        record({ channelUserId: "84901234567" }),
        "whatsapp",
        vn,
      ),
    ).toBeNull()
  })

  test("a channel without identity rules imports nothing", () => {
    expect(resolveContactSyncIdentity(record(), "webchat", vn)).toBeNull()
  })
})
