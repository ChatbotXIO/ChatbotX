import { describe, expect, test } from "vitest"
import {
  CONTACT_INBOX_METADATA_KEY,
  extractContactInboxId,
  withContactInboxMetadata,
} from "../src/contact-inbox-context"

describe("withContactInboxMetadata", () => {
  test("adds the contactInboxId key when provided", () => {
    // Arrange
    const metadata = { tagId: "tag-1" }

    // Act
    const result = withContactInboxMetadata(metadata, "ci-1")

    // Assert
    expect(result).toEqual({ tagId: "tag-1", contactInboxId: "ci-1" })
  })

  test("returns the metadata object byte-identical (same reference) when contactInboxId is omitted", () => {
    // Arrange
    const metadata = { tagId: "tag-1" }

    // Act
    const result = withContactInboxMetadata(metadata, undefined)

    // Assert
    expect(result).toBe(metadata)
  })

  test("returns undefined when both metadata and contactInboxId are omitted", () => {
    // Act
    const result = withContactInboxMetadata(undefined, undefined)

    // Assert
    expect(result).toBeUndefined()
  })

  test("builds a fresh metadata object from undefined when only contactInboxId is provided", () => {
    // Act
    const result = withContactInboxMetadata(undefined, "ci-1")

    // Assert
    expect(result).toEqual({ contactInboxId: "ci-1" })
  })

  test("does not mutate the original metadata object", () => {
    // Arrange
    const metadata = { tagId: "tag-1" }

    // Act
    withContactInboxMetadata(metadata, "ci-1")

    // Assert
    expect(metadata).toEqual({ tagId: "tag-1" })
  })
})

describe("extractContactInboxId", () => {
  test("returns the value for a real (numeric snowflake) id", () => {
    // Act — ContactInbox.id is a bigintAsString snowflake, i.e. digits only.
    const result = extractContactInboxId({
      [CONTACT_INBOX_METADATA_KEY]: "11669088263749632",
    })

    // Assert
    expect(result).toBe("11669088263749632")
  })

  test("returns undefined for a non-numeric string (malformed/replayed job)", () => {
    // A non-digit value must never reach the bigint `id` predicate in
    // findByIdForContact (Postgres would raise a cast error and fail the whole
    // trigger action) — it falls back to the most-recent inbox instead.
    for (const bad of ["not-an-id", "123abc", " 123", "12.3", "-5"]) {
      expect(
        extractContactInboxId({ [CONTACT_INBOX_METADATA_KEY]: bad }),
      ).toBeUndefined()
    }
  })

  test("returns undefined when eventData is undefined", () => {
    // Act
    const result = extractContactInboxId(undefined)

    // Assert
    expect(result).toBeUndefined()
  })

  test("returns undefined when the key is missing", () => {
    // Act
    const result = extractContactInboxId({ sourceId: "tag-1" })

    // Assert
    expect(result).toBeUndefined()
  })

  test("returns undefined when the value is null", () => {
    // Act
    const result = extractContactInboxId({
      [CONTACT_INBOX_METADATA_KEY]: null,
    })

    // Assert
    expect(result).toBeUndefined()
  })

  test("returns undefined when the value is not a string (malformed)", () => {
    // Act
    const result = extractContactInboxId({
      [CONTACT_INBOX_METADATA_KEY]: 12_345,
    })

    // Assert
    expect(result).toBeUndefined()
  })

  test("returns undefined when the value is an empty string", () => {
    // Act
    const result = extractContactInboxId({
      [CONTACT_INBOX_METADATA_KEY]: "",
    })

    // Assert
    expect(result).toBeUndefined()
  })

  test("returns undefined when the value is an object (malformed)", () => {
    // Act
    const result = extractContactInboxId({
      [CONTACT_INBOX_METADATA_KEY]: { nested: true },
    })

    // Assert
    expect(result).toBeUndefined()
  })
})
