import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { buildCtwaSegmentPredicate } from "../src/queries/contact-filter"

const since = new Date("2026-08-01T00:00:00.000Z")
const until = new Date("2026-08-10T23:59:59.999Z")

const render = (predicate: ReturnType<typeof buildCtwaSegmentPredicate>) =>
  new PgDialect().sqlToQuery(predicate)

describe("buildCtwaSegmentPredicate — conversations segment channel scoping", () => {
  test("messenger without an integration id still excludes instagram-channel ContactInbox rows", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        channel: "messenger",
        since,
        until,
      }),
    )

    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.params).toContain("messenger")
    expect(query.params).not.toContain("instagram")
  })

  test("instagram without an integration id still excludes messenger-channel ContactInbox rows", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        channel: "instagram",
        since,
        until,
      }),
    )

    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.params).toContain("instagram")
    expect(query.params).not.toContain("messenger")
  })

  test("messenger WITH an integration id keeps the channel scope alongside the EXISTS scope", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        channel: "messenger",
        integrationMessengerId: "im-1",
        workspaceId: "ws-1",
        since,
        until,
      }),
    )

    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.sql).toContain("EXISTS")
    expect(query.params).toContain("messenger")
    expect(query.params).toContain("im-1")
  })

  test("instagram WITH an integration id keeps the channel scope alongside the EXISTS scope", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        channel: "instagram",
        integrationInstagramId: "ig-1",
        workspaceId: "ws-1",
        since,
        until,
      }),
    )

    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.sql).toContain("EXISTS")
    expect(query.params).toContain("instagram")
    expect(query.params).toContain("ig-1")
  })

  test("whatsapp (channel omitted) keeps the original ctwaClid predicate with no ContactInbox.channel scope", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        since,
        until,
      }),
    )

    expect(query.sql).toContain("ctwaClid")
    expect(query.sql).not.toContain('"ContactInbox"."channel" =')
  })

  test("whatsapp (channel explicit) keeps the original ctwaClid predicate with no ContactInbox.channel scope", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        channel: "whatsapp",
        since,
        until,
      }),
    )

    expect(query.sql).toContain("ctwaClid")
    expect(query.sql).not.toContain('"ContactInbox"."channel" =')
  })
})
