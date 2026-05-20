import { describe, expect, test, vi } from "vitest"

// ── Mocks (must precede the dynamic import so the module can load) ────────────

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactModel: { findMany: vi.fn() },
      tagModel: { findMany: vi.fn() },
      customFieldModel: { findMany: vi.fn() },
    },
    update: () => ({
      set: () => ({ where: vi.fn() }),
    }),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}))

vi.mock("@chatbotx.io/database/partials", async () =>
  vi.importActual("@chatbotx.io/database/partials"),
)

vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: (criteria: unknown) => ({ __filter: criteria }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactCustomFieldModel: {},
  fileModel: { id: "File.id", workspaceId: "File.workspaceId" },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  loopableItemsCount: 100,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    createUpload: vi.fn(),
  },
}))

const { escapeCsvValue, buildHeaderLine, buildCsvChunk } = await import(
  "../src/default/handlers/export-contacts"
)

// ── Type alias for brevity ────────────────────────────────────────────────────

type SelectedField = Parameters<typeof buildCsvChunk>[1][number]

// ── escapeCsvValue ────────────────────────────────────────────────────────────

describe("escapeCsvValue", () => {
  test("wraps a plain value in double quotes", () => {
    // Arrange
    const value = "hello world"

    // Act
    const result = escapeCsvValue(value)

    // Assert
    expect(result).toBe('"hello world"')
  })

  test("returns empty quoted string for an empty string", () => {
    // Arrange / Act
    const result = escapeCsvValue("")

    // Assert
    expect(result).toBe('""')
  })

  test("escapes embedded double quotes by doubling them", () => {
    // Arrange
    const value = 'say "hello"'

    // Act
    const result = escapeCsvValue(value)

    // Assert
    expect(result).toBe('"say ""hello"""')
  })

  test("normalizes a Unix newline to a space", () => {
    // Arrange
    const value = "line1\nline2"

    // Act
    const result = escapeCsvValue(value)

    // Assert
    expect(result).toBe('"line1 line2"')
  })

  test("normalizes a Windows CRLF newline to a space", () => {
    // Arrange
    const value = "line1\r\nline2"

    // Act
    const result = escapeCsvValue(value)

    // Assert
    expect(result).toBe('"line1 line2"')
  })

  test.each([
    ["=1+1", `"'=1+1"`],
    ["+1234", `"'+1234"`],
    ["-cmd", `"'-cmd"`],
    ["@SUM(A1)", `"'@SUM(A1)"`],
    ["\tleading tab", `"'\tleading tab"`],
  ])("guards formula injection: %j is prefixed with a single quote", (value, expected) => {
    expect(escapeCsvValue(value)).toBe(expected)
  })

  test("does not escape a value with a formula char in the middle", () => {
    expect(escapeCsvValue("a=1+1")).toBe('"a=1+1"')
  })

  test("escapes a formula value that also contains embedded quotes", () => {
    expect(escapeCsvValue('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
  })
})

// ── buildHeaderLine ───────────────────────────────────────────────────────────

describe("buildHeaderLine", () => {
  test("joins escaped headers with commas and appends a trailing newline", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "contact", value: "fullName", header: "Full Name" },
      { type: "contact", value: "email", header: "Email" },
    ]

    // Act
    const result = buildHeaderLine(fields)

    // Assert
    expect(result).toBe('"Full Name","Email"\n')
  })

  test("escapes double quotes that appear in a header label", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "custom", value: "c1", header: 'Size "S"' },
    ]

    // Act
    const result = buildHeaderLine(fields)

    // Assert
    expect(result).toBe('"Size ""S"""\n')
  })

  test("produces a single-field header line", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "tag", value: "t1", header: "VIP" },
    ]

    // Act
    const result = buildHeaderLine(fields)

    // Assert
    expect(result).toBe('"VIP"\n')
  })
})

// ── buildCsvChunk ─────────────────────────────────────────────────────────────

describe("buildCsvChunk", () => {
  test("returns an empty string when the contacts array is empty", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "contact", value: "fullName", header: "Full Name" },
    ]

    // Act
    const result = buildCsvChunk([], fields)

    // Assert
    expect(result).toBe("")
  })

  test("produces one comma-separated row with a trailing newline for a single contact", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "contact", value: "fullName", header: "Full Name" },
      { type: "contact", value: "email", header: "Email" },
    ]
    const contacts = [
      { id: "1", fullName: "Jane Doe", email: "jane@example.com" },
    ]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('"Jane Doe","jane@example.com"\n')
  })

  test("serializes a Date field value as ISO string", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "contact", value: "blockedAt", header: "Blocked At" },
    ]
    const contacts = [
      { id: "1", blockedAt: new Date("2026-01-02T03:04:05.000Z") },
    ]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('"2026-01-02T03:04:05.000Z"\n')
  })

  test("renders null contact field as an empty quoted string", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "contact", value: "email", header: "Email" },
    ]
    const contacts = [{ id: "1", email: null }]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('""\n')
  })

  test("renders undefined contact field as an empty quoted string", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "contact", value: "phoneNumber", header: "Phone Number" },
    ]
    // phoneNumber key absent → undefined
    const contacts = [{ id: "1" }]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('""\n')
  })

  test("picks a custom field value by customFieldId", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "custom", value: "cf-plan", header: "Plan" },
    ]
    const contacts = [
      {
        id: "1",
        contactCustomFields: [{ customFieldId: "cf-plan", value: "Pro" }],
      },
    ]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('"Pro"\n')
  })

  test("renders an empty string when the custom field entry is missing", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "custom", value: "cf-plan", header: "Plan" },
    ]
    const contacts = [{ id: "1", contactCustomFields: [] }]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('""\n')
  })

  test("renders an empty string when contactCustomFields is undefined", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "custom", value: "cf-plan", header: "Plan" },
    ]
    const contacts = [{ id: "1" }]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('""\n')
  })

  test("renders Yes when the contact has the tag id", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "tag", value: "t1", header: "VIP" },
    ]
    const contacts = [{ id: "1", tags: [{ id: "t1" }] }]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('"Yes"\n')
  })

  test("renders No when the contact does not have the tag id", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "tag", value: "t1", header: "VIP" },
    ]
    const contacts = [{ id: "1", tags: [] }]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('"No"\n')
  })

  test("renders No when the contact tags array is undefined", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "tag", value: "t1", header: "VIP" },
    ]
    const contacts = [{ id: "1" }]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('"No"\n')
  })

  test("produces multiple rows separated by newlines for multiple contacts", () => {
    // Arrange
    const fields: SelectedField[] = [
      { type: "contact", value: "fullName", header: "Full Name" },
    ]
    const contacts = [
      { id: "1", fullName: "Alice" },
      { id: "2", fullName: "Bob" },
    ]

    // Act
    const result = buildCsvChunk(contacts, fields)

    // Assert
    expect(result).toBe('"Alice"\n"Bob"\n')
  })
})
