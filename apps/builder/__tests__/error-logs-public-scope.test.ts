// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"

const { errorLogResource } = await import(
  "../src/features/error-logs/schema/resource"
)
const { listErrorLogsRequest, publicListErrorLogsResponse } = await import(
  "../src/features/error-logs/schema/query"
)
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

  // Guards the omission against being made moot by a rename: if `sourceId`
  // ever stops being a key on the resource, the assertion above passes
  // vacuously.
  test("still carries sourceId on the internal resource", () => {
    expect(errorLogResource.parse(row)).toHaveProperty("sourceId", "1234567890")
  })

  // Stripping `sourceId` from the response is only half the defense:
  // `parseOrderByAsObject` gates on `sortItem.id in modelSchema`, so an
  // accepted `sort` would let an analytics-only token order rows by the
  // withheld identity and read it back as a lexicographic oracle.
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
    // `listErrorLogs` has no fallback order, so dropping `sort` without
    // pinning one would page unstably with no ORDER BY at all.
    expect(source).toContain('sort: [{ id: "createdAt", desc: true }]')
  })
})
