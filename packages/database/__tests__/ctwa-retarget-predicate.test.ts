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

  // Was: "whatsapp keeps the original ctwaClid predicate with NO
  // ContactInbox.channel scope". That held only while `ctwaClid` was the whole
  // predicate — a field no other channel writes, so the scope was intrinsic.
  // `adConversationPredicate` also accepts `adId` + `source === "ad"`
  // (Status ad placements carry no click id), and lowercase `ad` is
  // WhatsApp-shaped only by convention, so the branch now carries the same
  // explicit channel scope messenger/instagram always had.
  test("whatsapp (channel explicit) is scoped by ContactInbox.channel", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        channel: "whatsapp",
        since,
        until,
      }),
    )

    expect(query.sql).toContain("ctwaClid")
    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.params).toContain("whatsapp")
  })

  // The legacy caller passes no `channel`, only `integrationWhatsappId`; the
  // scope must still be applied, from the literal rather than the absent input.
  test("legacy channel-omitted + integrationWhatsappId caller is scoped too", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        integrationWhatsappId: "iw-1",
        workspaceId: "ws-1",
        since,
        until,
      }),
    )

    expect(query.sql).toContain('"ContactInbox"."channel" =')
    expect(query.params).toContain("whatsapp")
  })

  // "All channels" must NOT be scoped — it is the one branch that legitimately
  // spans every channel.
  test("no channel and no integration id -> no ContactInbox.channel scope", () => {
    const query = render(
      buildCtwaSegmentPredicate({ segment: "conversations", since, until }),
    )

    expect(query.sql).not.toContain('"ContactInbox"."channel" =')
  })
})

describe("WhatsApp ad conversations — Status-ad placements carry no ctwa_clid", () => {
  // Meta's WhatsApp messages webhook reference states the `ctwa_clid` property
  // "is omitted entirely for messages originating from an ad in WhatsApp
  // Status". Keying the conversation predicate on `ctwaClid` alone therefore
  // dropped every Status-ad conversation from the funnel even though the same
  // payload still carries the ad id in `referral.source_id`.
  test("counts a whatsapp conversation that has an adId but no ctwaClid", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        channel: "whatsapp",
        since,
        until,
      }),
    )

    expect(query.sql).toContain("'ctwaClid'")
    expect(query.sql).toContain("'adId'")
    // `source_type` is "ad" for a paid placement and "post" for an organic
    // post — only the paid one may count.
    expect(query.params).toContain("ad")
    expect(query.params).not.toContain("post")
  })

  test("does not widen the messenger predicate to the whatsapp ad source", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        channel: "messenger",
        since,
        until,
      }),
    )

    expect(query.params).toContain("ADS")
    expect(query.params).not.toContain("ad")
  })
  // The two CTWA funnel counters used to gate on a bare `ctwaClid IS NOT NULL`
  // and now share this predicate, which also requires `<> ''`. That is a no-op
  // on real rows — `asString` (integrations/whatsapp/src/lib/value.ts) maps an
  // empty string to null, so `referral.ctwaClid` is never stored as `""` — but
  // it is pinned here because the guarantee lives in the writer, not the schema.
  test("requires a non-empty ctwaClid, not merely a present one", () => {
    const query = render(
      buildCtwaSegmentPredicate({
        segment: "conversations",
        channel: "whatsapp",
        since,
        until,
      }),
    )

    expect(query.sql).toContain(`"ContactInbox"."referral"->>'ctwaClid' <> ''`)
  })
})
