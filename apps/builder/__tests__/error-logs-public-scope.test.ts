// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const { errorLogResource } = await import(
  "../src/features/error-logs/schema/resource"
)
const {
  SORTABLE_COLUMNS,
  WITHHELD_ERROR_LOG_COLUMNS,
  withheldErrorLogColumns,
} = await import("@chatbotx.io/business/error-log-columns")
const {
  listErrorLogsRequest,
  listErrorLogsResponse,
  publicListErrorLogsResponse,
} = await import("../src/features/error-logs/schema/query")
const { withPublicPaging } = await import("../src/lib/public-api/list")

const PUBLIC_ROUTE_FILE = join(
  import.meta.dirname,
  "..",
  "src",
  "features",
  "error-logs",
  "api",
  "public.ts",
)

const row = {
  id: "el-1",
  workspaceId: "ws-1",
  contactId: null,
  sourceId: "1234567890",
  stackTrace: "    at /srv/app/packages/business/src/x.ts:1:1",
  action: "meta-conversions",
  detail: "boom",
  httpCode: "400",
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("public error-log response scope", () => {
  // `GET /v1/error-logs` is gated by the `analytics` scope, while the same
  // channel identity (PSID / IGSID / `wa_id`) is public only under `contacts`.
  // `errorLogResource` is a `createSelectSchema`, so this has to be asserted:
  // any new column joins the public payload for free.
  test("strips sourceId from the public payload", () => {
    const parsed = publicListErrorLogsResponse.parse({
      data: [row],
      pageCount: 1,
    })

    expect(parsed.data[0]).not.toHaveProperty("sourceId")
    expect(parsed.data[0]?.action).toBe("meta-conversions")
  })

  test("strips stackTrace from the public payload", () => {
    const parsed = publicListErrorLogsResponse.parse({
      data: [row],
      pageCount: 1,
    })

    expect(parsed.data[0]).not.toHaveProperty("stackTrace")
    expect(JSON.stringify(parsed)).not.toContain("/srv/app/")
  })

  // Guards the omission against being made moot by a rename: if `sourceId`
  // ever stops being a key on the resource, the assertion above passes
  // vacuously.
  test("still carries sourceId on the internal resource", () => {
    expect(errorLogResource.parse(row)).toHaveProperty("sourceId", "1234567890")
  })

  // The public route takes no caller-supplied order at all: it pins one
  // index-backed order so a paging integration sees a stable sequence. The
  // withheld-column oracle is handled separately, by `SORTABLE_COLUMNS` — see
  // the allow-list test below.
  test("drops caller-controlled sort from the public input", () => {
    const publicInput = withPublicPaging(
      listErrorLogsRequest.omit({ sort: true, workspaceId: true }),
    )

    const parsed = publicInput.parse({
      perPage: 5,
      sort: JSON.stringify([{ id: "sourceId", desc: false }]),
    })

    expect(parsed).not.toHaveProperty("sort")
  })

  // The assertion above composes the schema the way the route does; this one
  // checks the route still composes it that way, so the two cannot drift into
  // a vacuous pass. Same technique as `public-router-boundary.test.ts`.
  test("the public route omits sort and pins the order server-side", () => {
    const source = readFileSync(PUBLIC_ROUTE_FILE, "utf8")

    expect(source).toContain("sort: true")
    // `listErrorLogs` does apply a fallback order, but this route owns its
    // paging stability rather than inheriting it: dropping `sort` without
    // pinning one here would make the guarantee a query-layer detail away
    // from breaking.
    expect(source).toContain('sort: [{ id: "createdAt", desc: true }]')
  })
})

// `stackTrace` is withheld one level further than `sourceId` was: not just from
// the public route but from the builder's own response, so a stack never
// crosses the network at all. It leaks absolute server paths and our internal
// call chain, and no reader needs it — it is read from the database directly.
describe("internal error-log response scope", () => {
  test("strips stackTrace and sourceId from the internal payload", () => {
    const parsed = listErrorLogsResponse.parse({
      data: [{ ...row, contact: null }],
      pageCount: 1,
    })

    expect(parsed.data[0]).not.toHaveProperty("stackTrace")
    expect(parsed.data[0]).not.toHaveProperty("sourceId")
    // The guarantee the producer used to make and no longer can: the stack is
    // in the payload the writer persists, so the boundary is here instead.
    expect(JSON.stringify(parsed)).not.toContain("/srv/app/")
  })

  // Guards against the omission above passing vacuously after a rename.
  test("both columns still exist on the underlying resource", () => {
    const parsed = errorLogResource.parse(row)

    expect(parsed).toHaveProperty("sourceId", "1234567890")
    expect(parsed).toHaveProperty("stackTrace")
  })

  // Omitting the fields from the response schema only strips them after the
  // database has already returned them. This keeps them out of the SELECT —
  // asserted on the value the query layer actually uses, not on its source.
  test("the withheld columns are excluded from the SELECT", () => {
    expect(withheldErrorLogColumns(false)).toEqual({
      stackTrace: false,
      sourceId: false,
    })
  })

  // Handed to `parseOrderByAsObject` as its allow-list: without one that helper
  // accepts any id present on the model, so ordering by a withheld column is a
  // lexicographic oracle over it — the same attack the public route pins its
  // order against. The allow-list closes it for every hidden column, not just
  // today's two.
  test("no withheld column is sortable", () => {
    for (const column of WITHHELD_ERROR_LOG_COLUMNS) {
      expect(SORTABLE_COLUMNS.has(column)).toBe(false)
    }
    // The sorts the table actually produces must survive the allow-list.
    for (const column of ["action", "detail", "createdAt"]) {
      expect(SORTABLE_COLUMNS.has(column)).toBe(true)
    }
  })
})
