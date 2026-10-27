import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { applyContactFilter } from "../src/queries/contact-filter"
import { contactModel } from "../src/schema"

const WORKSPACE_ID = "11"
const PIPELINE_ID = "22"
const STARTS_EXISTS = /^EXISTS \(/
const STARTS_NOT_EXISTS = /^NOT EXISTS \(/

const render = (condition: Record<string, unknown>, workspaceId?: string) => {
  const where = applyContactFilter(
    {
      operator: "and",
      conditions: [{ field: "pipelineItem", ...condition }],
    },
    workspaceId,
  )
  const raw = (where as { AND?: Array<{ RAW?: unknown }> }).AND?.[0]?.RAW
  if (typeof raw !== "function") {
    return null
  }
  return new PgDialect().sqlToQuery(
    (raw as (table: typeof contactModel) => SQL)(contactModel),
  )
}

const FALSE_SQL = "FALSE"

describe("pipelineItem contact condition SQL", () => {
  test("exists/isNotEmpty with any status is a workspace scoped EXISTS", () => {
    const query = render(
      {
        attribute: "exists",
        pipelineId: null,
        operator: "isNotEmpty",
        value: "any",
      },
      WORKSPACE_ID,
    )
    expect(query?.sql).toMatch(STARTS_EXISTS)
    expect(query?.sql).toContain('"PipelineItem"."workspaceId" =')
    expect(query?.sql).toContain('"PipelineItem"."contactId" =')
    expect(query?.sql).not.toContain('"PipelineItem"."pipelineId"')
    expect(query?.sql).not.toContain('"PipelineItem"."status"')
    expect(query?.params).toContain(WORKSPACE_ID)
  })

  test("exists/isEmpty with a status is NOT EXISTS of that status in one pipeline", () => {
    const query = render(
      {
        attribute: "exists",
        pipelineId: PIPELINE_ID,
        operator: "isEmpty",
        value: "won",
      },
      WORKSPACE_ID,
    )
    expect(query?.sql).toMatch(STARTS_NOT_EXISTS)
    expect(query?.sql).toContain('"PipelineItem"."pipelineId" =')
    expect(query?.sql).toContain('"PipelineItem"."status" =')
    expect(query?.params).toEqual(
      expect.arrayContaining([WORKSPACE_ID, PIPELINE_ID, "won"]),
    )
  })

  test.each([
    ["status", ["open", "lost"], "status"],
    ["priority", ["high"], "priority"],
  ])("%s in/notIn bind every value and negate with NOT EXISTS", (attribute, value, column) => {
    const positive = render(
      { attribute, pipelineId: null, operator: "in", value },
      WORKSPACE_ID,
    )
    const negative = render(
      { attribute, pipelineId: null, operator: "notIn", value },
      WORKSPACE_ID,
    )
    expect(positive?.sql).toMatch(STARTS_EXISTS)
    expect(positive?.sql).toContain(`"PipelineItem"."${column}" IN (`)
    expect(negative?.sql).toMatch(STARTS_NOT_EXISTS)
    expect(positive?.params).toEqual(expect.arrayContaining(value))
  })

  test("stage in binds the stage ids inside the required pipeline", () => {
    const query = render(
      {
        attribute: "stage",
        pipelineId: PIPELINE_ID,
        operator: "in",
        value: ["5", "6"],
      },
      WORKSPACE_ID,
    )
    expect(query?.sql).toMatch(STARTS_EXISTS)
    expect(query?.sql).toContain('"PipelineItem"."pipelineId" =')
    expect(query?.sql).toContain('"PipelineItem"."stageId" IN (')
    expect(query?.params).toEqual(
      expect.arrayContaining(["5", "6", PIPELINE_ID]),
    )
  })

  test("stage notIn is NOT EXISTS", () => {
    const query = render(
      {
        attribute: "stage",
        pipelineId: PIPELINE_ID,
        operator: "notIn",
        value: ["5"],
      },
      WORKSPACE_ID,
    )
    expect(query?.sql).toMatch(STARTS_NOT_EXISTS)
  })

  test.each([
    [
      "no workspace",
      {
        attribute: "status",
        pipelineId: null,
        operator: "in",
        value: ["open"],
      },
      undefined,
    ],
    [
      "stage without a pipeline",
      { attribute: "stage", pipelineId: null, operator: "in", value: ["5"] },
      WORKSPACE_ID,
    ],
    [
      "non numeric pipeline id",
      {
        attribute: "status",
        pipelineId: "1; DROP",
        operator: "in",
        value: ["open"],
      },
      WORKSPACE_ID,
    ],
    [
      "non numeric stage id",
      {
        attribute: "stage",
        pipelineId: PIPELINE_ID,
        operator: "in",
        value: ["x"],
      },
      WORKSPACE_ID,
    ],
    [
      "unknown status",
      {
        attribute: "status",
        pipelineId: null,
        operator: "in",
        value: ["archived"],
      },
      WORKSPACE_ID,
    ],
    [
      "unknown priority",
      { attribute: "priority", pipelineId: null, operator: "in", value: [] },
      WORKSPACE_ID,
    ],
    [
      "wrong operator for status",
      {
        attribute: "status",
        pipelineId: null,
        operator: "eq",
        value: ["open"],
      },
      WORKSPACE_ID,
    ],
    [
      "wrong operator for exists",
      { attribute: "exists", pipelineId: null, operator: "in", value: "any" },
      WORKSPACE_ID,
    ],
    [
      "unknown exists value",
      {
        attribute: "exists",
        pipelineId: null,
        operator: "isNotEmpty",
        value: "closed",
      },
      WORKSPACE_ID,
    ],
    [
      "unknown attribute",
      { attribute: "title", pipelineId: null, operator: "in", value: ["a"] },
      WORKSPACE_ID,
    ],
  ])("fails closed for %s", (_label, condition, workspaceId) => {
    const query = render(condition, workspaceId)
    expect(query?.sql).toBe(FALSE_SQL)
  })
})
