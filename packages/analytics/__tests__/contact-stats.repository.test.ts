import { beforeEach, describe, expect, test, vi } from "vitest"

type SqlFragment = { strings: readonly string[]; values: unknown[] }

const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
  strings: [...strings],
  values,
})
sql.join = (items: unknown[]) => ({ __join: items })
sql.identifier = (name: string) => ({ strings: [`"${name}"`], values: [] })

const execute = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: { execute, insert: vi.fn() },
  sql,
}))
vi.mock("@chatbotx.io/database/queries/date-bucket", () => ({
  resolvedTimezone: (timezone: string) => timezone,
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  analyticsContactEventModel: {},
}))

const { ContactStatsRepository } = await import(
  "../src/repositories/postgres/contact-stats.repository"
)

const isSqlFragment = (value: unknown): value is SqlFragment =>
  typeof value === "object" && value !== null && "strings" in value

// Flattens nested fragments into the query text and the bound parameters.
function render(fragment: SqlFragment): { text: string; params: unknown[] } {
  let text = ""
  const params: unknown[] = []
  fragment.strings.forEach((chunk, index) => {
    text += chunk
    if (index >= fragment.values.length) {
      return
    }
    const value = fragment.values[index]
    if (isSqlFragment(value)) {
      const inner = render(value)
      text += inner.text
      params.push(...inner.params)
      return
    }
    text += "?"
    params.push(value)
  })
  return { text: text.replace(/\s+/g, " ").trim(), params }
}

const from = new Date("2026-10-01T00:00:00.000Z")
const to = new Date("2026-10-07T23:59:59.999Z")
const baseProps = {
  workspaceId: "ws-1",
  from,
  to,
  timezone: "UTC",
}

const repository = new ContactStatsRepository()

function lastQuery(): { text: string; params: unknown[] } {
  return render(execute.mock.calls.at(-1)?.[0] as SqlFragment)
}

beforeEach(() => {
  execute.mockReset()
  execute.mockResolvedValue({ rows: [] })
})

describe("ContactStatsRepository.getContactsByDimension — new", () => {
  test.each([
    ["country", '"country"'],
    ["channel", '"channel"'],
    ["source", '"source"'],
  ] as const)("groups %s created inside the range", async (dimension, column) => {
    await repository.getContactsByDimension({
      ...baseProps,
      dimension,
      metric: "new",
    })

    const { text, params } = lastQuery()
    expect(text).toContain(`SELECT ${column} AS dimension`)
    expect(text).toContain(`AND ${column} IS NOT NULL AND ${column} != ''`)
    expect(text).toContain(`"eventType" = 'contact_created'`)
    expect(text).toContain('"occurredAt" >= ? AND "occurredAt" <= ?')
    expect(params).toEqual(["ws-1", from, to])
  })

  test("maps rows to numbers", async () => {
    execute.mockResolvedValue({
      rows: [{ dimension: "messenger", count: "4", uniqueContacts: "3" }],
    })

    await expect(
      repository.getContactsByDimension({
        ...baseProps,
        dimension: "channel",
        metric: "new",
      }),
    ).resolves.toEqual([
      { dimension: "messenger", count: 4, uniqueContacts: 3 },
    ])
  })
})

describe("ContactStatsRepository.getContactsByDimension — total", () => {
  test("counts created minus deleted up to the range end only", async () => {
    await repository.getContactsByDimension({
      ...baseProps,
      dimension: "channel",
      metric: "total",
    })

    const { text, params } = lastQuery()
    expect(text).toContain(`COALESCE(NULLIF("channel", ''), '') AS dimension`)
    expect(text).toContain(
      `COUNT(*) FILTER (WHERE "eventType" = 'contact_created') - COUNT(*) FILTER (WHERE "eventType" = 'contact_deleted')`,
    )
    expect(text).toContain(
      `"eventType" IN ('contact_created', 'contact_deleted')`,
    )
    expect(text).toContain('"occurredAt" <= ?')
    expect(text).not.toContain('"occurredAt" >=')
    expect(text).toContain("HAVING")
    // workspace scoping + `to` only: `from` never reaches the query
    expect(params).toEqual(["ws-1", to])
  })

  test("keeps the unknown group and maps rows to numbers", async () => {
    execute.mockResolvedValue({
      rows: [
        { dimension: "messenger", count: 7, uniqueContacts: 7 },
        { dimension: "", count: "2", uniqueContacts: "2" },
      ],
    })

    await expect(
      repository.getContactsByDimension({
        ...baseProps,
        dimension: "source",
        metric: "total",
      }),
    ).resolves.toEqual([
      { dimension: "messenger", count: 7, uniqueContacts: 7 },
      { dimension: "", count: 2, uniqueContacts: 2 },
    ])
  })

  test("returns an empty list when nothing matches", async () => {
    await expect(
      repository.getContactsByDimension({
        ...baseProps,
        dimension: "channel",
        metric: "total",
      }),
    ).resolves.toEqual([])
  })

  test("propagates database failures", async () => {
    execute.mockRejectedValue(new Error("connection lost"))

    await expect(
      repository.getContactsByDimension({
        ...baseProps,
        dimension: "channel",
        metric: "total",
      }),
    ).rejects.toThrow("connection lost")
  })
})
