import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { channelPostManagementRepository } from "../src/repositories/channel-post/management"
import { channelPostRepository } from "../src/repositories/channel-post/repository"

const dialect = new PgDialect()
const TWO_CHANNEL_ALTERNATIVES =
  /\(.*"channel" = \$2.*\) or \(.*"channel" = \$4.*\)/s

const listWhere = async (
  shareable: Parameters<
    typeof channelPostManagementRepository.list
  >[0]["filters"]["shareable"],
) => {
  const limit = vi.fn().mockResolvedValue([])
  const orderBy = vi.fn().mockReturnValue({ limit })
  const where = vi.fn().mockReturnValue({ orderBy })
  const innerJoin = vi.fn().mockReturnValue({ where })
  const from = vi.fn().mockReturnValue({ innerJoin })
  const select = vi.fn().mockReturnValue({ from })
  await channelPostManagementRepository.list(
    {
      filters: { hasComments: false, shareable },
      limit: 31,
      sort: "newest",
      workspaceId: "ws-1",
    },
    { select } as unknown as DatabaseClient,
  )
  return dialect.sqlToQuery(where.mock.calls[0][0])
}

describe("management list: shareable filter", () => {
  test("is absent unless asked for", async () => {
    const { sql } = await listWhere(undefined)

    expect(sql).not.toContain("contentType")
  })

  test("a native channel is its channel and content types, with no link condition", async () => {
    const { sql, params } = await listWhere([
      {
        channel: "instagram",
        contentTypes: ["photo", "reel"],
        requirePermalink: false,
      },
    ])

    expect(sql).toContain('"ChannelPost"."channel" = $2')
    expect(sql).toContain('"ChannelPost"."contentType" in ($3, $4)')
    expect(sql).not.toContain("permalink")
    expect(params).toEqual(["ws-1", "instagram", "photo", "reel"])
  })

  test("a text-link channel also needs a non-blank permalink", async () => {
    const { sql } = await listWhere([
      { channel: "messenger", contentTypes: ["photo"], requirePermalink: true },
    ])

    expect(sql).toContain('"ChannelPost"."permalink" is not null')
    expect(sql).toContain('btrim("ChannelPost"."permalink") <> \'\'')
  })

  test("several channels are alternatives, each with its own rule", async () => {
    const { sql } = await listWhere([
      {
        channel: "instagram",
        contentTypes: ["photo"],
        requirePermalink: false,
      },
      { channel: "messenger", contentTypes: ["text"], requirePermalink: true },
    ])

    expect(sql).toMatch(TWO_CHANNEL_ALTERNATIVES)
  })

  test("no channel that can send posts keeps no post", async () => {
    const { sql } = await listWhere([])

    expect(sql).toContain("false")
  })
})

describe("channelPostRepository.findForInbox", () => {
  test("scopes to the workspace and the post, hides removed posts and reports the inbox match", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([{ id: "p1", inboxId: "inbox-2", caption: null }])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })

    const row = await channelPostRepository.findForInbox(
      { channelPostId: "p1", inboxId: "inbox-1", workspaceId: "ws-1" },
      { select } as unknown as DatabaseClient,
    )
    const query = dialect.sqlToQuery(where.mock.calls[0][0])

    expect(query.sql).toContain('"ChannelPost"."workspaceId" = $1')
    expect(query.sql).toContain('"ChannelPost"."id" = $2')
    expect(query.sql).toContain('"ChannelPost"."removedAt" is null')
    expect(query.params).toEqual(["ws-1", "p1"])
    expect(row).toMatchObject({ id: "p1", inboxMatches: false })
  })

  test("is null for a missing or removed post", async () => {
    const limit = vi.fn().mockResolvedValue([])
    const select = vi.fn().mockReturnValue({
      from: vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) }),
    })

    await expect(
      channelPostRepository.findForInbox(
        { channelPostId: "p1", inboxId: "inbox-1", workspaceId: "ws-1" },
        { select } as unknown as DatabaseClient,
      ),
    ).resolves.toBeNull()
  })
})
