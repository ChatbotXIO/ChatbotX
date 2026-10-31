import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, test } from "vitest"
import {
  COLUMN_SLOTS,
  JSON_CONTAINERS,
} from "../src/template/uninstall-references"

/**
 * Every table that holds a column reference to a copied parent must either be
 * written through a service that calls `assertReferencable` (or the
 * `referencedParents` guard of `assertEditable`), or sit in `ALLOWLIST` with a
 * reason. A new COLUMN_SLOTS entry fails here until it is classified.
 */
// A writer guards its references through one of these two calls.
const GUARD_CALL = /assertReferencable|referencedParents/

const GUARDED: Record<string, string> = {
  Reflink: "reflink/service.ts",
  AutomatedResponse: "automated-response/service.ts",
  IntegrationWebchat: "integration-webchat/service.ts",
  AIFunction: "ai-function/service.ts",
  SequenceStep: "sequence/service.ts",
  AppointmentCalendar: "appointment-calendar/service.ts",
  AppointmentCalendarReminder: "appointment-calendar/service.ts",
  Questionnaire: "questionnaire/service.ts",
  Condition: "trigger/service.ts",
  Broadcast: "broadcast/service.ts",
  BroadcastTarget: "broadcast/service.ts",
  AIHandoverSettings: "ai-handover-settings/service.ts",
  EcommerceSettings: "ecommerce-settings/service.ts",
  IntegrationInstagram: "integration-instagram/service.ts",
  IntegrationMessenger: "integration-messenger/service.ts",
  IntegrationWhatsapp: "integration-whatsapp/service.ts",
  Leaderboard: "leaderboard/service.ts",
  PipelineItem: "pipeline/item.service.ts",
}

const ALLOWLIST: Record<string, string> = {
  IntegrationZalo:
    "fallbackFlowId has no writer in the codebase today; add the guard with the first writer",
  IntegrationOpenai:
    "aiAgentId has no writer in the codebase today (update only takes autoReply); add the guard with the first writer",
  OrderItem:
    "high-volume checkout insert; the FK insert takes KEY SHARE on the product row, which waits on the commit transaction's parent-row FOR UPDATE, and every holder is probed again under that lock",
  MetaCatalogItem:
    "catalog sync insert; same FK KEY SHARE vs parent-row FOR UPDATE protection as OrderItem, and the commit probe sees the holder",
}

const tables = [...new Set(COLUMN_SLOTS.map((slot) => slot.table))]

describe("COLUMN_SLOTS holder tables are guarded or allowlisted", () => {
  test("every holder table is classified exactly once", () => {
    const unclassified = tables.filter(
      (table) => !(table in GUARDED || table in ALLOWLIST),
    )
    expect(unclassified).toEqual([])
    const both = tables.filter(
      (table) => table in GUARDED && table in ALLOWLIST,
    )
    expect(both).toEqual([])
  })

  test("no stale entries", () => {
    const stale = [...Object.keys(GUARDED), ...Object.keys(ALLOWLIST)].filter(
      (table) => !tables.includes(table),
    )
    expect(stale).toEqual([])
  })

  test("every allowlist entry carries a reason", () => {
    for (const reason of Object.values(ALLOWLIST)) {
      expect(reason.length).toBeGreaterThan(20)
    }
  })

  test.each(
    Object.entries(GUARDED),
  )("%s is written through %s, which guards its references", (_table, file) => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src", file),
      "utf8",
    )
    expect(source).toMatch(GUARD_CALL)
  })
})

/** The writers of every table whose JSON is probed (`JSON_CONTAINERS`). */
const JSON_GUARDED: Record<string, string> = {
  FlowVersion: "flow-version/service.ts",
  Trigger: "trigger/service.ts",
  Condition: "trigger/service.ts",
  CommentAutomation: "comment-automation/service.ts",
  AIAgent: "ai-agent/service.ts",
  IntegrationWebchat: "integration-webchat/service.ts",
  IntegrationMessenger: "integration-messenger/service.ts",
  IntegrationInstagram: "integration-instagram/service.ts",
  Broadcast: "broadcast/service.ts",
  BroadcastTarget: "broadcast/service.ts",
  DiscountCode: "discount-code/service.ts",
}

describe("JSON_CONTAINERS tables are written through a guard", () => {
  const jsonTables = [
    ...new Set(JSON_CONTAINERS.map((container) => container.table)),
  ]

  test("every probed JSON table is classified, with no stale entries", () => {
    expect(jsonTables.filter((table) => !(table in JSON_GUARDED))).toEqual([])
    expect(
      Object.keys(JSON_GUARDED).filter((table) => !jsonTables.includes(table)),
    ).toEqual([])
  })

  test.each(
    Object.entries(JSON_GUARDED),
  )("%s is written through %s, which guards its references", (_table, file) => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src", file),
      "utf8",
    )
    expect(source).toMatch(GUARD_CALL)
  })
})
