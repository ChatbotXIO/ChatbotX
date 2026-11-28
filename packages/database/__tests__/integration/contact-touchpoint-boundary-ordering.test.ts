// @vitest-environment node

/**
 * Boundary matrix for the inbox "Opted In through" feed, part 3: the exact total
 * order of every kind at one instant with numeric-vs-text resource keys, paging
 * across it, and cursors that never expose foreign rows.
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm exec dotenv -e ../../.env -- pnpm exec vitest run <this file>`.
 */

import { describe, expect, test } from "vitest"
import {
  type ContactTouchpointKind,
  contactTouchpointKinds,
} from "../../src/partials/contact-touchpoint"
import {
  at,
  databaseUrl,
  installBoundaryWorld,
  newId,
} from "./contact-touchpoint-boundary-fixtures"

describe.skipIf(!databaseUrl)(
  "contact touchpoint boundary: ordering, paging and cursors",
  async () => {
    const { contactTouchpointRepository } = await import(
      "../../src/repositories/contact-touchpoint/repository"
    )
    const ctx = installBoundaryWorld(contactTouchpointRepository)
    const { keys, list, makeContact, makeContactInbox, makeInbox, seeders } =
      ctx

    describe("B1: every kind at the same instant, resource keys of different digit lengths", () => {
      const instant = at("2026-10-01T00:00:00")
      const r = () => BigInt(Math.floor(Math.random() * 1_000_000_000))
      // 16, 17 and 18 digits: "9..." sorts after "10..." and "100..." as text but
      // before them as a number.
      const ids = () => [
        String(9_000_000_000_000_000n + r()),
        String(10_000_000_000_000_000n + r()),
        String(100_000_000_000_000_000n + r()),
      ]

      const seedAll = async () => {
        const expected: { kind: ContactTouchpointKind; key: string }[] = []
        for (const kind of contactTouchpointKinds.options) {
          for (const id of ids()) {
            const parent = await seeders[kind].make(
              ctx.world.workspaceId,
              ctx.world.inboxId,
              id,
            )
            const ci = await makeContactInbox(
              ctx.world.contactId,
              ctx.world.inboxId,
            )
            const key = await seeders[kind].add(parent, {
              rowWs: ctx.world.workspaceId,
              contactId: ctx.world.contactId,
              ci,
              when: instant,
              key: id,
              n: 0,
            })
            expected.push({ kind, key })
          }
        }
        // Order: kind DESC (plain ASCII), then numeric resourceKey DESC.
        expected.sort((a, b) => {
          if (a.kind !== b.kind) {
            return a.kind < b.kind ? 1 : -1
          }
          const diff = BigInt(b.key) - BigInt(a.key)
          if (diff === 0n) {
            return 0
          }
          return diff > 0n ? 1 : -1
        })
        return expected.map((entry) => `${entry.kind}:${entry.key}`)
      }

      const walk = async (limit: number) => {
        const seen: string[] = []
        let cursor:
          | Parameters<
              typeof contactTouchpointRepository.listByContact
            >[0]["cursor"]
          | undefined
        for (let guard = 0; guard < 500; guard++) {
          const page = await list({ limit, cursor })
          seen.push(...page.map((row) => `${row.kind}:${row.resourceKey}`))
          const last = page.at(-1)
          if (page.length < limit || !last) {
            return seen
          }
          cursor = {
            occurredAt: last.occurredAtKey,
            kind: last.kind,
            resourceKey: last.resourceKey,
          }
        }
        throw new Error("paging did not terminate")
      }

      test("one page is the exact total order", async () => {
        const expected = await seedAll()

        const rows = await list({ limit: 500 })
        const tied = rows
          .filter((row) => row.occurredAt.getTime() === instant.getTime())
          .map((row) => `${row.kind}:${row.resourceKey}`)

        expect(tied).toEqual(expected)
        expect(new Set(tied).size).toBe(39)
      })

      test.each([
        1, 2, 7,
      ])("perPage=%i walks the same order with no gap and no repeat", async (perPage) => {
        const expected = await seedAll()

        const walked = (await walk(perPage)).filter((entry) =>
          expected.includes(entry),
        )

        expect(walked).toEqual(expected)
        expect(new Set(walked).size).toBe(walked.length)
      })

      test("a cursor in the middle of the tie resumes exactly after that row", async () => {
        const expected = await seedAll()
        const middle = 20
        const [kind, key] = expected[middle].split(":") as [
          ContactTouchpointKind,
          string,
        ]

        const page = await list({
          limit: 5,
          cursor: {
            occurredAt: "2026-10-01T00:00:00.000000Z",
            kind,
            resourceKey: key,
          },
        })

        expect(page.map((row) => `${row.kind}:${row.resourceKey}`)).toEqual(
          expected.slice(middle + 1, middle + 6),
        )
      })
    })

    describe("B5: a structurally valid cursor never exposes foreign rows", () => {
      test("a cursor naming another workspace's resource key pages only this contact's rows", async () => {
        const link = await seeders.magicLink.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await seeders.magicLink.add(link, {
          rowWs: ctx.world.workspaceId,
          contactId: ctx.world.contactId,
          ci: ctx.world.contactInboxId,
          when: at("2026-10-01T00:00:00"),
          n: 0,
        })
        const foreignInbox = await makeInbox(ctx.world.otherWorkspaceId)
        const foreignLink = await seeders.magicLink.make(
          ctx.world.otherWorkspaceId,
          foreignInbox,
          newId(),
        )
        const foreignContact = await makeContact(ctx.world.otherWorkspaceId)
        const foreignCi = await makeContactInbox(foreignContact, foreignInbox)
        await seeders.magicLink.add(foreignLink, {
          rowWs: ctx.world.otherWorkspaceId,
          contactId: foreignContact,
          ci: foreignCi,
          when: at("2026-09-30T00:00:00"),
          n: 0,
        })

        const rows = await list({
          cursor: {
            occurredAt: "2026-10-02T00:00:00.000000Z",
            kind: "magicLink",
            resourceKey: foreignLink,
          },
        })

        expect(keys(rows)).not.toContain(foreignLink)
        expect(keys(rows)).toContain(link)
      })

      test("the same contact id queried through the foreign workspace sees nothing of this one", async () => {
        const link = await seeders.magicLink.make(
          ctx.world.workspaceId,
          ctx.world.inboxId,
          newId(),
        )
        await seeders.magicLink.add(link, {
          rowWs: ctx.world.workspaceId,
          contactId: ctx.world.contactId,
          ci: ctx.world.contactInboxId,
          when: at("2026-10-01T00:00:00"),
          n: 0,
        })

        const rows = await list({ workspaceId: ctx.world.otherWorkspaceId })

        expect(rows).toEqual([])
      })
    })
  },
)
