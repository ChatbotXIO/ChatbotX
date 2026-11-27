// @vitest-environment node

/**
 * Truth table of the custom-field filter against real Postgres: every operator
 * of every comparison kind (text, number, date, boolean) over matching,
 * non-matching, missing, empty and malformed stored values, plus calendar-day
 * comparison across a timezone boundary. Each kind seeds its own workspace.
 *
 * Runs only against an explicitly configured database
 * (`pnpm --filter @chatbotx.io/database test:db`).
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  type PIPELINE_FIELD_OPERATORS_BY_TYPE,
  pipelineSettingsSchema,
} from "../../src/partials/pipeline"
import { relations } from "../../src/relations"
import {
  type PipelineFieldCondition,
  pipelineItemRepository,
  pipelineRepository,
  pipelineStageRepository,
} from "../../src/repositories/pipeline"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()
const FIELD_ID = "50"

type CustomFieldType = keyof typeof PIPELINE_FIELD_OPERATORS_BY_TYPE
type Fixture = {
  userId: string
  workspaceId: string
  pipelineId: string
  stageId: string
  contactId: string
}

describe.skipIf(!databaseUrl)("pipeline custom-field filter SQL", () => {
  let client: Client
  const fixtures: Fixture[] = []
  const database = () => drizzle({ client, relations, schema })

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl })
    await client.connect()
  })

  afterAll(async () => {
    const db = database()
    for (const fixture of fixtures) {
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, fixture.workspaceId))
      await db
        .delete(schema.userModel)
        .where(eq(schema.userModel.id, fixture.userId))
    }
    await client.end()
  })

  /** A workspace whose items carry `values` (title -> stored field value; undefined = key missing). */
  const seed = async (
    label: string,
    values: Record<string, string | undefined>,
  ): Promise<Fixture> => {
    const db = database()
    const suffix = `${label}-${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `field-filter-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `field-filter-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    const [contact] = await db
      .insert(schema.contactModel)
      .values({ workspaceId: workspace.id })
      .returning({ id: schema.contactModel.id })
    const pipeline = await pipelineRepository.insert(
      {
        workspaceId: workspace.id,
        name: "Sales",
        type: "opportunity",
        referenceName: "sales",
        currency: "USD",
        settings: pipelineSettingsSchema.parse({}),
      },
      db,
    )
    const [stage] = await pipelineStageRepository.insertMany(
      [
        {
          workspaceId: workspace.id,
          pipelineId: pipeline.id,
          name: "Lead",
          position: 0,
        },
      ],
      db,
    )
    const fixture: Fixture = {
      userId: user.id,
      workspaceId: workspace.id,
      pipelineId: pipeline.id,
      stageId: stage.id,
      contactId: contact.id,
    }
    fixtures.push(fixture)
    for (const [title, value] of Object.entries(values)) {
      await db.transaction(async (tx) => {
        const number = await pipelineRepository.nextItemNumber(workspace.id, tx)
        await pipelineItemRepository.insertIdempotent(
          {
            workspaceId: workspace.id,
            pipelineId: pipeline.id,
            stageId: stage.id,
            contactId: contact.id,
            number,
            title,
            status: "open",
            priority: "medium",
            fieldValues: value === undefined ? {} : { [FIELD_ID]: value },
            stageEnteredAt: new Date(),
          },
          tx,
        )
      })
    }
    return fixture
  }

  const matcher =
    (fixture: Fixture, fieldType: CustomFieldType) =>
    async (condition: PipelineFieldCondition, timezone?: string) =>
      (
        await pipelineItemRepository.listStagePage({
          workspaceId: fixture.workspaceId,
          pipelineId: fixture.pipelineId,
          stageId: fixture.stageId,
          sort: { key: "createdAt", direction: "asc" },
          limit: 50,
          filter: {
            fieldConditions: { [FIELD_ID]: condition },
            fieldTypes: { [FIELD_ID]: fieldType },
            timezone,
          },
        })
      ).items.map((item) => item.title)

  describe("text", () => {
    let run: ReturnType<typeof matcher>
    beforeAll(async () => {
      const fixture = await seed("text", {
        Gold: "Gold Plan",
        Silver: "silver",
        Percent: "100%_off",
        Empty: "",
        Missing: undefined,
      })
      run = matcher(fixture, "shortText")
    })

    test.each([
      [{ operator: "is", value: "silver" }, ["Silver"]],
      [{ operator: "is", value: "SILVER" }, []],
      [{ operator: "isNot", value: "silver" }, ["Gold", "Percent"]],
      [{ operator: "contains", value: "GOLD" }, ["Gold"]],
      [{ operator: "contains", value: "%" }, ["Percent"]],
      [{ operator: "contains", value: "_" }, ["Percent"]],
      [{ operator: "contains", value: "zzz" }, []],
      [{ operator: "notContains", value: "gold" }, ["Silver", "Percent"]],
      [{ operator: "startsWith", value: "SIL" }, ["Silver"]],
      [{ operator: "startsWith", value: "plan" }, []],
      [{ operator: "endsWith", value: "plan" }, ["Gold"]],
      [{ operator: "endsWith", value: "gold" }, []],
      [{ operator: "hasValue" }, ["Gold", "Silver", "Percent"]],
      [{ operator: "noValue" }, ["Empty", "Missing"]],
    ] as [
      PipelineFieldCondition,
      string[],
    ][])("%j matches %j", async (condition, expected) => {
      expect(await run(condition)).toEqual(expected)
    })
  })

  describe("number", () => {
    let run: ReturnType<typeof matcher>
    beforeAll(async () => {
      const fixture = await seed("number", {
        Ten: "10",
        Twenty: "20.5",
        Negative: "-3",
        Malformed: "12abc",
        Exponent: "1e3",
        Empty: "",
        Missing: undefined,
      })
      run = matcher(fixture, "number")
    })

    test.each([
      [{ operator: "is", value: "10" }, ["Ten"]],
      [{ operator: "is", value: "10.0" }, ["Ten"]],
      [{ operator: "is", value: "99" }, []],
      [{ operator: "isNot", value: "10" }, ["Twenty", "Negative"]],
      [{ operator: "gt", value: "10" }, ["Twenty"]],
      [{ operator: "gt", value: "-3" }, ["Ten", "Twenty"]],
      [{ operator: "lt", value: "20.5" }, ["Ten", "Negative"]],
      [{ operator: "lt", value: "-3" }, []],
      [
        { operator: "between", value: "10", valueTo: "20.5" },
        ["Ten", "Twenty"],
      ],
      [{ operator: "between", value: "10" }, ["Ten", "Twenty"]],
      [{ operator: "between", valueTo: "10" }, ["Ten", "Negative"]],
      [{ operator: "between", value: "11", valueTo: "12" }, []],
      // An unusable operand adds no condition: every item comes back.
      [
        { operator: "gt", value: "abc" },
        [
          "Ten",
          "Twenty",
          "Negative",
          "Malformed",
          "Exponent",
          "Empty",
          "Missing",
        ],
      ],
      [
        { operator: "hasValue" },
        ["Ten", "Twenty", "Negative", "Malformed", "Exponent"],
      ],
      [{ operator: "noValue" }, ["Empty", "Missing"]],
    ] as [
      PipelineFieldCondition,
      string[],
    ][])("%j matches %j", async (condition, expected) => {
      expect(await run(condition)).toEqual(expected)
    })
  })

  describe("datetime", () => {
    let run: ReturnType<typeof matcher>
    beforeAll(async () => {
      const fixture = await seed("datetime", {
        // 2026-05-19 17:00Z: the 20th in Ho Chi Minh, the 19th in UTC and Los Angeles.
        MorningVn: "2026-05-20T00:00:00+07:00",
        // 2026-05-20 16:30Z: the 20th in UTC and Los Angeles, the 20th in Ho Chi Minh.
        EveningVn: "2026-05-20T23:30:00+07:00",
        // 2026-05-21 00:00Z: the 21st in UTC and Ho Chi Minh, the 20th in Los Angeles.
        NextUtc: "2026-05-21T00:00:00Z",
        NotADate: "not a date",
        ImpossibleDay: "2026-02-30T00:00:00Z",
        ImpossibleMonth: "2026-13-01T00:00:00Z",
        Empty: "",
        Missing: undefined,
      })
      run = matcher(fixture, "datetime")
    })

    const VN = "Asia/Ho_Chi_Minh"
    const LA = "America/Los_Angeles"

    test("is compares the calendar day in the given timezone", async () => {
      const is = { operator: "is", value: "2026-05-20" } as const
      expect(await run(is, VN)).toEqual(["MorningVn", "EveningVn"])
      expect(await run(is, "UTC")).toEqual(["EveningVn"])
      expect(await run(is, LA)).toEqual(["EveningVn", "NextUtc"])
    })

    test("a missing or unknown timezone falls back to UTC", async () => {
      const is = { operator: "is", value: "2026-05-20" } as const
      expect(await run(is)).toEqual(["EveningVn"])
      expect(await run(is, "Mars/Olympus")).toEqual(["EveningVn"])
    })

    test.each([
      [{ operator: "isNot", value: "2026-05-20" }, ["NextUtc"]],
      [{ operator: "gt", value: "2026-05-20" }, ["NextUtc"]],
      [{ operator: "gt", value: "2026-05-21" }, []],
      [{ operator: "lt", value: "2026-05-21" }, ["MorningVn", "EveningVn"]],
      [{ operator: "lt", value: "2026-05-20" }, []],
      [
        { operator: "between", value: "2026-05-20", valueTo: "2026-05-20" },
        ["MorningVn", "EveningVn"],
      ],
      [
        { operator: "between", value: "2026-05-20", valueTo: "2026-05-21" },
        ["MorningVn", "EveningVn", "NextUtc"],
      ],
      [{ operator: "between", value: "2026-05-21" }, ["NextUtc"]],
      [{ operator: "between", valueTo: "2026-05-19" }, []],
    ] as [
      PipelineFieldCondition,
      string[],
    ][])("%j matches %j in Ho Chi Minh", async (condition, expected) => {
      expect(await run(condition, VN)).toEqual(expected)
    })

    test("malformed stored values never throw and only count as present", async () => {
      expect(await run({ operator: "gt", value: "2000-01-01" }, VN)).toEqual([
        "MorningVn",
        "EveningVn",
        "NextUtc",
      ])
      expect(await run({ operator: "hasValue" })).toEqual([
        "MorningVn",
        "EveningVn",
        "NextUtc",
        "NotADate",
        "ImpossibleDay",
        "ImpossibleMonth",
      ])
      expect(await run({ operator: "noValue" })).toEqual(["Empty", "Missing"])
    })

    test("an impossible operand day adds no condition instead of throwing", async () => {
      expect(
        await run({ operator: "is", value: "2026-02-30" }, VN),
      ).toHaveLength(8)
    })
  })

  describe("date (a picked day, compared as written)", () => {
    let run: ReturnType<typeof matcher>
    beforeAll(async () => {
      const fixture = await seed("date", {
        // Picked "20 May" in Ho Chi Minh: shown as the 20th everywhere.
        PickedVn: "2026-05-20T00:00:00+07:00",
        PickedUtc: "2026-05-21T00:00:00Z",
        NotADate: "not a date",
        Missing: undefined,
      })
      run = matcher(fixture, "date")
    })

    test("is matches the stored day whatever the filter timezone", async () => {
      const is = { operator: "is", value: "2026-05-20" } as const
      for (const zone of ["UTC", "America/Los_Angeles", "Asia/Ho_Chi_Minh"]) {
        expect(await run(is, zone)).toEqual(["PickedVn"])
      }
    })

    test.each([
      [{ operator: "isNot", value: "2026-05-20" }, ["PickedUtc"]],
      [{ operator: "gt", value: "2026-05-20" }, ["PickedUtc"]],
      [{ operator: "lt", value: "2026-05-21" }, ["PickedVn"]],
      [
        { operator: "between", value: "2026-05-20", valueTo: "2026-05-21" },
        ["PickedVn", "PickedUtc"],
      ],
    ] as [
      PipelineFieldCondition,
      string[],
    ][])("%j matches %j", async (condition, expected) => {
      expect(await run(condition, "America/Los_Angeles")).toEqual(expected)
    })
  })

  describe("number in exponent form", () => {
    test("values the canonicalizer writes as 1e-7 / 1e+21 still compare", async () => {
      const fixture = await seed("exponent", {
        Tiny: "1e-7",
        Huge: "1e+21",
        Zero: "0",
      })
      const run = matcher(fixture, "number")

      expect(await run({ operator: "is", value: "0.0000001" })).toEqual([
        "Tiny",
      ])
      expect(await run({ operator: "gt", value: "0" })).toEqual([
        "Tiny",
        "Huge",
      ])
      expect(await run({ operator: "lt", value: "1" })).toEqual([
        "Tiny",
        "Zero",
      ])
    })
  })

  describe("boolean", () => {
    let run: ReturnType<typeof matcher>
    beforeAll(async () => {
      const fixture = await seed("boolean", {
        Yes: "true",
        No: "false",
        Maybe: "maybe",
        Empty: "",
        Missing: undefined,
      })
      run = matcher(fixture, "boolean")
    })

    test.each([
      [{ operator: "is", value: "true" }, ["Yes"]],
      [{ operator: "is", value: "false" }, ["No"]],
      [{ operator: "isNot", value: "true" }, ["No"]],
      [{ operator: "isNot", value: "false" }, ["Yes"]],
      [{ operator: "hasValue" }, ["Yes", "No", "Maybe"]],
      [{ operator: "noValue" }, ["Empty", "Missing"]],
      [
        { operator: "is", value: "maybe" },
        ["Yes", "No", "Maybe", "Empty", "Missing"],
      ],
    ] as [
      PipelineFieldCondition,
      string[],
    ][])("%j matches %j", async (condition, expected) => {
      expect(await run(condition)).toEqual(expected)
    })
  })
})
