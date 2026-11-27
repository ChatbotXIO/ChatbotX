import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { contactFilterFields } from "../src/partials/contact"
import {
  CONTACT_ACTIVITY_ALLOWED_PAIRS,
  CONTACT_ACTIVITY_FILTERS,
  contactActivityReferenceTypes,
  contactActivityTypes,
  isAllowedContactActivity,
  isContactActivityFilterField,
  NO_REFERENCE_ID,
  UNSCOPED_PARENT_REFERENCE_ID,
} from "../src/partials/contact-activity"

const DRIZZLE_DIR = join(import.meta.dirname, "../drizzle")
const MIGRATION_FOLDER_PATTERN = /^\d/
const ACTIVITY_ENUM_PATTERN = /contactActivity(Reference)?Type/

const readMigrationsSql = (): string[] =>
  readdirSync(DRIZZLE_DIR)
    .filter((name) => MIGRATION_FOLDER_PATTERN.test(name))
    .sort()
    .map((name) =>
      readFileSync(join(DRIZZLE_DIR, name, "migration.sql"), "utf8"),
    )

/** The newest statement that defines the pair CHECK (a migration may replace it). */
const readLatestPairCheck = (): string | undefined =>
  readMigrationsSql()
    .flatMap((sql) => sql.split("\n"))
    .filter(
      (line) =>
        line.includes("ContactActivity_allowed_pair_check") &&
        line.includes("CHECK"),
    )
    .at(-1)

/** The enums are created once and extended by later `ADD VALUE` migrations. */
const readActivityEnumMigrations = (): string =>
  readMigrationsSql()
    .filter((sql) => ACTIVITY_ENUM_PATTERN.test(sql))
    .join("\n")

describe("contact activity registry", () => {
  test("every filter field is a real contact filter field", () => {
    for (const field of Object.keys(CONTACT_ACTIVITY_FILTERS)) {
      expect(contactFilterFields.safeParse(field).success).toBe(true)
    }
  })

  test("uses only declared activity and reference types", () => {
    for (const config of Object.values(CONTACT_ACTIVITY_FILTERS)) {
      expect(contactActivityTypes.options).toContain(config.activityType)
      expect(contactActivityReferenceTypes.options).toContain(
        config.referenceType,
      )
    }
  })

  test("every declared activity and reference type is used by a filter", () => {
    const configs = Object.values(CONTACT_ACTIVITY_FILTERS)
    for (const type of contactActivityTypes.options) {
      expect(configs.some((config) => config.activityType === type)).toBe(true)
    }
    for (const type of contactActivityReferenceTypes.options) {
      expect(configs.some((config) => config.referenceType === type)).toBe(true)
    }
  })

  test("only a parent-scoped reference carries a flowId:nodeId format", () => {
    for (const config of Object.values(CONTACT_ACTIVITY_FILTERS)) {
      expect(config.parentScoped).toBe(config.valueFormat === "flowId:nodeId")
    }
  })

  test("guards unknown field names", () => {
    expect(isContactActivityFilterField("executedFlow")).toBe(true)
    expect(isContactActivityFilterField("toString")).toBe(false)
    expect(isContactActivityFilterField("tags")).toBe(false)
  })

  test("sentinels cannot collide with real ids", () => {
    expect(UNSCOPED_PARENT_REFERENCE_ID).toBe("0")
    expect(NO_REFERENCE_ID).toBe("-1")
  })

  test("validates activity writes against the allowed pairs", () => {
    expect(
      isAllowedContactActivity({
        activityType: "flowNodeExecuted",
        parentReferenceId: "7",
        referenceType: "flowNode",
      }),
    ).toBe(true)
    expect(
      isAllowedContactActivity({
        activityType: "flowNodeExecuted",
        parentReferenceId: UNSCOPED_PARENT_REFERENCE_ID,
        referenceType: "flowNode",
      }),
    ).toBe(false)
    expect(
      isAllowedContactActivity({
        activityType: "flowExecuted",
        parentReferenceId: "7",
        referenceType: "flow",
      }),
    ).toBe(false)
    expect(
      isAllowedContactActivity({
        activityType: "flowExecuted",
        parentReferenceId: UNSCOPED_PARENT_REFERENCE_ID,
        referenceType: "emailTopic",
      }),
    ).toBe(false)
  })
})

describe("contact activity migration CHECK parity", () => {
  test("lists exactly the registry's allowed pairs", () => {
    const check = readLatestPairCheck()
    expect(check).toBeDefined()

    const clauses = check?.match(/\("activityType" = '[^)]+\)/g) ?? []
    expect(clauses).toHaveLength(CONTACT_ACTIVITY_ALLOWED_PAIRS.length)
    for (const pair of CONTACT_ACTIVITY_ALLOWED_PAIRS) {
      const operator = pair.parentScoped ? "<>" : "="
      expect(check).toContain(
        `("activityType" = '${pair.activityType}' AND "referenceType" = '${pair.referenceType}' AND "parentReferenceId" ${operator} ${UNSCOPED_PARENT_REFERENCE_ID})`,
      )
    }
  })

  test("creates the enums from the registry values", () => {
    const sql = readActivityEnumMigrations()
    for (const value of contactActivityTypes.options) {
      expect(sql).toContain(`'${value}'`)
    }
    for (const value of contactActivityReferenceTypes.options) {
      expect(sql).toContain(`'${value}'`)
    }
  })
})
