import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { humanReplyWindowSet } from "../src/conversation/human-reply-window"

const render = (fragment: unknown) =>
  new PgDialect().sqlToQuery(fragment as never).sql

describe("humanReplyWindowSet SLA snapshot", () => {
  const SLA_KEYS = [
    "responseDueAt",
    "responseSlaBreachingAt",
    "responseSlaTargetSeconds",
  ] as const

  test.each([
    ["bot", { close: new Date(), actor: "bot" as const }],
    ["externalHuman", { close: new Date(), actor: "externalHuman" as const }],
    ["archive", { close: new Date(), actor: "archive" as const }],
  ])("a %s close clears every snapshot field under the window's own condition", (_actor, transition) => {
    const set = humanReplyWindowSet(transition)
    const windowCondition = render(set.awaitingHumanReplySince)

    for (const key of SLA_KEYS) {
      const rendered = render(set[key])
      expect(rendered).toContain("THEN NULL")
      expect(rendered).toContain(`ELSE "${key}"`)
      // Same WHEN clause as the window itself, so the two cannot disagree.
      expect(rendered.split("THEN NULL")[0]).toBe(
        windowCondition.split("THEN NULL")[0],
      )
    }
  })

  test("an open never touches the snapshot", () => {
    const set = humanReplyWindowSet({ open: new Date() })

    for (const key of SLA_KEYS) {
      expect(set).not.toHaveProperty(key)
    }
  })
})
