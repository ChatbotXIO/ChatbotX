// @vitest-environment node

/**
 * Real-database hardening checks for the pipeline services: creator rights per
 * caller kind, assignment effects, races on the open-item limit / idempotency /
 * stage positions, hostile ids, FK cascades, activity history and DST-safe
 * analytics. Complements pipeline-service.test.ts and runs only against an
 * explicitly configured local database with the pipelines migration applied.
 */

import { db, eq, inArray, sql } from "@chatbotx.io/database/client"
import {
  pipelineActivityRepository,
  pipelineItemRepository,
  pipelineRepository,
  templateInstallationRepository,
} from "@chatbotx.io/database/repositories"
import {
  contactModel,
  inboxTeamModel,
  mediaLibraryFileModel,
  pipelineItemActivityModel,
  pipelineItemAssigneeModel,
  pipelineItemModel,
  pipelineMemberModel,
  templateInstalledResourceModel,
  templateModel,
  userModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { DrizzleQueryError } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  barrier,
  heldBy,
  waitUntilSomeoneWaitsOnAnAdvisoryLock,
  within,
} from "../helpers/template-concurrency"

const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const mocks = vi.hoisted(() => ({
  emitPipelineItemEvent: vi.fn(),
  queueWorkspaceRealtimeEvent: vi.fn(),
  assignByContactIds: vi.fn(),
  queueAdd: vi.fn(),
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitPipelineItemEvent: mocks.emitPipelineItemEvent,
}))
vi.mock("../../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent: mocks.queueWorkspaceRealtimeEvent,
}))
vi.mock("../../src/conversation/service", () => ({
  conversationService: {
    assignByContactIds: mocks.assignByContactIds,
    findDMByContactIds: vi.fn().mockResolvedValue([]),
    findLatestSmtpConversationByContact: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@chatbotx.io/redis", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/redis")>()),
  withCache: (_key: string, fn: () => Promise<unknown>) => fn(),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))
vi.mock("../../src/ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    get: vi.fn().mockResolvedValue({ payments: { currency: "VND" } }),
  },
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  defaultQueue: {
    add: mocks.queueAdd,
    getJob: vi.fn().mockResolvedValue(null),
  },
}))

const { pipelineService } = await import("../../src/pipeline/service")
const { pipelineItemService } = await import("../../src/pipeline/item.service")
const { pipelineItemContentService } = await import(
  "../../src/pipeline/item-content.service"
)
const { pipelineMemberService } = await import(
  "../../src/pipeline/pipeline-member.service"
)
const { pipelineStructureService } = await import(
  "../../src/pipeline/pipeline-structure.service"
)
const { pipelineItemQueryService } = await import(
  "../../src/pipeline/item-query.service"
)
const { pipelineAnalyticsService } = await import(
  "../../src/pipeline/analytics.service"
)
const { pipelineStageBulkService } = await import(
  "../../src/pipeline/stage-bulk.service"
)
const { lockStageOrder, stageOrderLockKey } = await import(
  "../../src/pipeline/stage-order"
)
const { assertReferencable } = await import(
  "../../src/template/installed-resource.service"
)
const { withTemplateLockedTransaction } = await import(
  "../../src/template/template-resource-locks"
)

type Fixture = {
  userIds: string[]
  workspaceId: string
  /** The owner's workspace member. */
  memberId: string
  userId: string
  /** A second, plain (agent) member. */
  plainMemberId: string
  plainUserId: string
  contactIds: string[]
  teamId: string
  mediaFileId: string
}

const databaseUrl = realDatabaseUrl()
const token = { kind: "workspaceToken" } as const
const actor = { kind: "user", userId: null, sourceId: null } as const

const SEEDED_OR_MOVED_TITLE = /^(e\d{4}|m)$/

const statusOf = (reason: unknown) =>
  (reason as { httpStatusCode?: number }).httpStatusCode

describe.skipIf(!databaseUrl)("pipeline services: hardening", () => {
  let own: Fixture
  let other: Fixture

  const createFixture = async (label: string): Promise<Fixture> => {
    const suffix = `${label}-${Date.now()}-${Math.random()}`
    const [owner] = await db
      .insert(userModel)
      .values({ email: `pipeline-hard-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [plainUser] = await db
      .insert(userModel)
      .values({ email: `pipeline-hard-plain-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `pipeline-hard-${suffix}`, ownerId: owner.id })
      .returning({ id: workspaceModel.id })
    const [member] = await db
      .insert(workspaceMemberModel)
      .values({ workspaceId: workspace.id, userId: owner.id, role: "owner" })
      .returning({ id: workspaceMemberModel.id })
    const [plain] = await db
      .insert(workspaceMemberModel)
      .values({
        workspaceId: workspace.id,
        userId: plainUser.id,
        role: "agent",
      })
      .returning({ id: workspaceMemberModel.id })
    const contacts = await db
      .insert(contactModel)
      .values([{ workspaceId: workspace.id }, { workspaceId: workspace.id }])
      .returning({ id: contactModel.id })
    const [team] = await db
      .insert(inboxTeamModel)
      .values({ workspaceId: workspace.id, name: "Support" })
      .returning({ id: inboxTeamModel.id })
    const [file] = await db
      .insert(mediaLibraryFileModel)
      .values({
        workspaceId: workspace.id,
        name: "a.png",
        path: `x/${suffix}.png`,
        mimeType: "image/png",
        size: 10,
      })
      .returning({ id: mediaLibraryFileModel.id })
    return {
      userIds: [owner.id, plainUser.id],
      userId: owner.id,
      plainUserId: plainUser.id,
      workspaceId: workspace.id,
      memberId: member.id,
      plainMemberId: plain.id,
      contactIds: contacts.map((contact) => contact.id),
      teamId: team.id,
      mediaFileId: file.id,
    }
  }

  const cleanup = async (fixture: Fixture | undefined) => {
    if (!fixture) {
      return
    }
    await db
      .delete(workspaceModel)
      .where(eq(workspaceModel.id, fixture.workspaceId))
    await db.delete(userModel).where(inArray(userModel.id, fixture.userIds))
  }

  const newPipeline = async (fixture: Fixture, name = "Sales") =>
    await pipelineService.create({
      workspaceId: fixture.workspaceId,
      type: "opportunity",
      name,
      scope: token,
      actor,
    })

  const limitOpenItems = async (
    fixture: Fixture,
    pipeline: Awaited<ReturnType<typeof newPipeline>>,
    maxOpenItemsPerContact: number,
  ) =>
    await pipelineService.update({
      workspaceId: fixture.workspaceId,
      id: pipeline.id,
      scope: token,
      values: { settings: { ...pipeline.settings, maxOpenItemsPerContact } },
    })

  const newItem = async (
    fixture: Fixture,
    pipelineId: string,
    overrides: Partial<Parameters<typeof pipelineItemService.create>[0]> = {},
  ) =>
    await pipelineItemService.create({
      workspaceId: fixture.workspaceId,
      pipelineId,
      contactId: fixture.contactIds[0],
      fields: { title: "Deal" },
      scope: token,
      actor,
      ...overrides,
    })

  const setStatus = async (
    fixture: Fixture,
    pipelineId: string,
    itemId: string,
    status: "open" | "won" | "lost",
  ) =>
    await pipelineItemService.update({
      workspaceId: fixture.workspaceId,
      pipelineId,
      itemId,
      fields: { status },
      scope: token,
      actor,
    })

  const stagesOf = async (fixture: Fixture, pipelineId: string) =>
    (
      await pipelineService.get({
        workspaceId: fixture.workspaceId,
        id: pipelineId,
        scope: token,
      })
    ).stages

  const readItem = async (
    fixture: Fixture,
    pipelineId: string,
    itemId: string,
  ) =>
    await pipelineItemQueryService.getItem({
      workspaceId: fixture.workspaceId,
      pipelineId,
      itemId,
      scope: token,
    })

  const membersOf = async (fixture: Fixture, pipelineId: string) =>
    await pipelineMemberService.listMembers({
      workspaceId: fixture.workspaceId,
      pipelineId,
      scope: token,
    })

  const attach = async (
    fixture: Fixture,
    pipelineId: string,
    itemId: string,
    mediaLibraryFileId: string,
  ) => {
    await pipelineItemContentService.addAttachments({
      workspaceId: fixture.workspaceId,
      pipelineId,
      itemId,
      mediaLibraryFileIds: [mediaLibraryFileId],
      scope: token,
      actor,
    })
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    own = await createFixture("own")
    other = await createFixture("other")
  })

  afterEach(async () => {
    await cleanup(own)
    await cleanup(other)
  })

  describe("creator rights", () => {
    test.each([
      ["a workspace token", () => token],
      ["platform support", () => ({ kind: "support" }) as const],
      [
        "a workspace admin member",
        () =>
          ({
            kind: "member",
            workspaceMemberId: own.memberId,
            isWorkspaceAdmin: true,
            canViewContactEmailAndPhone: true,
          }) as const,
      ],
    ])("%s gets no PipelineMember row", async (_name, makeScope) => {
      const pipeline = await pipelineService.create({
        workspaceId: own.workspaceId,
        type: "opportunity",
        name: "Sales",
        scope: makeScope(),
        actor,
      })

      expect(await membersOf(own, pipeline.id)).toEqual([])
    })

    test("a plain member gets exactly one row with every right", async () => {
      const pipeline = await pipelineService.create({
        workspaceId: own.workspaceId,
        type: "opportunity",
        name: "Sales",
        scope: {
          kind: "member",
          workspaceMemberId: own.plainMemberId,
          isWorkspaceAdmin: false,
          canViewContactEmailAndPhone: true,
        },
        actor,
      })

      expect(await membersOf(own, pipeline.id)).toEqual([
        expect.objectContaining({
          workspaceMemberId: own.plainMemberId,
          canView: true,
          canEdit: true,
          canDelete: true,
          canManageSettings: true,
        }),
      ])
    })
  })

  describe("assignment effect", () => {
    test("moving the primary assignee from a user to a team re-assigns the contact to the team", async () => {
      const pipeline = await newPipeline(own)
      await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
        values: {
          settings: { ...pipeline.settings, assignContactOnAssign: true },
        },
      })
      const item = await newItem(own, pipeline.id)
      await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: { assigneeMemberIds: [own.memberId] },
        scope: token,
        actor,
      })
      expect(mocks.assignByContactIds).toHaveBeenLastCalledWith(
        expect.objectContaining({ assignedId: `u_${own.userId}` }),
      )
      mocks.assignByContactIds.mockClear()

      await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: {
          assigneeMemberIds: [],
          assigneeInboxTeamIds: [own.teamId],
        },
        scope: token,
        actor,
      })

      expect(mocks.assignByContactIds).toHaveBeenCalledTimes(1)
      expect(mocks.assignByContactIds).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: own.workspaceId,
          contactIds: [own.contactIds[0]],
          assignedId: `t_${own.teamId}`,
          onlyFromAssignees: [null, `u_${own.userId}`],
        }),
      )
    })
  })

  describe("concurrency", () => {
    /** Marks `pipelineId` as copied by a template install: its writers now take its template lock. */
    const markInstalled = async (fixture: Fixture, pipelineId: string) => {
      const [template] = await db
        .insert(templateModel)
        .values({
          workspaceId: fixture.workspaceId,
          tenantId: "1",
          name: "Template",
          selection: { mode: "all" } as never,
          payload: {} as never,
          categoryCounts: {},
          formatVersion: 1,
          shareToken: `tok-${fixture.workspaceId}-${pipelineId}`,
          defaultPermissions: { allowEdit: true, allowDelete: true },
          version: 1,
        })
        .returning({ id: templateModel.id })
      const installation = await templateInstallationRepository.create({
        workspaceId: fixture.workspaceId,
        templateId: template.id,
        sourceTemplateId: template.id,
        templateName: "Template",
        sourceWorkspaceId: "999000",
        formatVersion: 1,
        status: "completed",
        permissions: { allowEdit: true, allowDelete: true },
        sourceVersion: 1,
      })
      await db.insert(templateInstalledResourceModel).values({
        installationId: installation.id,
        workspaceId: fixture.workspaceId,
        category: "pipelines",
        resourceKind: "pipeline",
        resourceId: pipelineId,
        sourceResourceId: `src-${pipelineId}`,
        wasExisting: false,
        allowEdit: true,
        allowDelete: true,
      })
    }

    test("deals in a template-installed pipeline are created while another deal's reference is still open", async () => {
      const pipeline = await newPipeline(own, "Installed")
      await markInstalled(own, pipeline.id)
      const held = barrier()
      const release = barrier()
      // A writer in the middle of adding its own deal: the pipeline's
      // reference lock is held until `release` opens.
      const open = withTemplateLockedTransaction(
        async (tx) => {
          await assertReferencable({
            workspaceId: own.workspaceId,
            parents: [{ kind: "pipeline", resourceId: pipeline.id }],
            tx,
          })
          held.open()
          await release.promise
        },
        { workspaceId: own.workspaceId },
      )
      let items: Awaited<ReturnType<typeof newItem>>[] = []
      let started: Promise<Awaited<ReturnType<typeof newItem>>>[] = []
      try {
        await within(heldBy(held.promise, open))
        // Both new deals commit while that reference is still open: under an
        // exclusive lock they would wait for it and the bounded wait would fail.
        started = [
          newItem(own, pipeline.id, { contactId: own.contactIds[0] }),
          newItem(own, pipeline.id, { contactId: own.contactIds[1] }),
        ]
        items = await within(Promise.all(started))
      } finally {
        release.open()
        // Every started operation, not the aggregate: one failing deal must
        // not let the other overlap the fixture cleanup.
        await Promise.allSettled([open, ...started])
      }
      expect(items.map((item) => item.pipelineId)).toEqual([
        pipeline.id,
        pipeline.id,
      ])
    }, 30_000)

    test("a create racing a reopen never exceeds the open-item limit", async () => {
      for (let round = 0; round < 3; round += 1) {
        const pipeline = await newPipeline(own, `Race ${round}`)
        const limited = await limitOpenItems(own, pipeline, 1)
        const closed = await newItem(own, pipeline.id, {
          fields: { title: "closed", status: "won" },
        })

        const results = await Promise.allSettled([
          newItem(own, pipeline.id, { fields: { title: "fresh" } }),
          setStatus(own, limited.id, closed.id, "open"),
        ])

        expect(
          results.filter((result) => result.status === "fulfilled"),
          `round ${round}`,
        ).toHaveLength(1)
        const rejected = results.find((result) => result.status === "rejected")
        expect(statusOf(rejected?.reason)).toBe(409)
        const open = await pipelineItemQueryService.listItems({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          filter: { statuses: ["open"] },
          scope: token,
        })
        expect(open.items).toHaveLength(1)
      }
    })

    test("a transfer racing a create never exceeds the destination's limit", async () => {
      for (let round = 0; round < 3; round += 1) {
        const source = await newPipeline(own, `Src ${round}`)
        const destination = await newPipeline(own, `Dst ${round}`)
        await limitOpenItems(own, destination, 1)
        const moving = await newItem(own, source.id)

        const results = await Promise.allSettled([
          pipelineItemService.transfer({
            workspaceId: own.workspaceId,
            pipelineId: source.id,
            itemId: moving.id,
            destinationPipelineId: destination.id,
            scope: token,
            actor,
          }),
          newItem(own, destination.id, { fields: { title: "native" } }),
        ])

        expect(
          results.filter((result) => result.status === "fulfilled"),
          `round ${round}`,
        ).toHaveLength(1)
        const rejected = results.find((result) => result.status === "rejected")
        expect(statusOf(rejected?.reason)).toBe(409)
        const open = await pipelineItemQueryService.listItems({
          workspaceId: own.workspaceId,
          pipelineId: destination.id,
          filter: { statuses: ["open"] },
          scope: token,
        })
        expect(open.items).toHaveLength(1)
      }
    })

    test("concurrent creates with one idempotency key and contact produce exactly one item", async () => {
      const pipeline = await newPipeline(own)

      const created = await Promise.all(
        Array.from({ length: 6 }, () =>
          newItem(own, pipeline.id, { idempotencyKey: "same-contact" }),
        ),
      )

      expect(new Set(created.map((item) => item.id)).size).toBe(1)
      const rows = await db
        .select({ id: pipelineItemModel.id })
        .from(pipelineItemModel)
        .where(eq(pipelineItemModel.pipelineId, pipeline.id))
      expect(rows).toHaveLength(1)
      expect(
        mocks.emitPipelineItemEvent.mock.calls.filter(
          ([type]) => type === "pipelineItemCreated",
        ),
      ).toHaveLength(1)
    })

    test("concurrent creates with one idempotency key for two contacts give one success and one 409", async () => {
      const pipeline = await newPipeline(own)

      const results = await Promise.allSettled(
        own.contactIds.map((contactId) =>
          newItem(own, pipeline.id, { contactId, idempotencyKey: "shared" }),
        ),
      )

      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1)
      const rejected = results.find((result) => result.status === "rejected")
      expect(statusOf(rejected?.reason)).toBe(409)
      const rows = await db
        .select({ id: pipelineItemModel.id })
        .from(pipelineItemModel)
        .where(eq(pipelineItemModel.pipelineId, pipeline.id))
      expect(rows).toHaveLength(1)
    })

    test("concurrent comments with one idempotency key leave one comment", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)

      const comments = await Promise.all(
        Array.from({ length: 6 }, () =>
          pipelineItemContentService.addComment({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            itemId: item.id,
            text: "once",
            idempotencyKey: "c-race",
            scope: token,
            actor,
          }),
        ),
      )

      expect(new Set(comments.map((comment) => comment.id)).size).toBe(1)
      const detail = await readItem(own, pipeline.id, item.id)
      expect(detail.commentCount).toBe(1)
    })

    test("a reorder racing stage creates keeps positions a permutation of 0..n-1", async () => {
      const pipeline = await newPipeline(own)
      for (const name of ["B", "C"]) {
        await pipelineStructureService.createStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          name,
          scope: token,
        })
      }
      const before = await stagesOf(own, pipeline.id)

      const results = await Promise.allSettled([
        pipelineStructureService.reorderStages({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          stageIds: before.map((stage) => stage.id).reverse(),
          scope: token,
        }),
        ...["D", "E", "F"].map((name) =>
          pipelineStructureService.createStage({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            name,
            scope: token,
          }),
        ),
      ])

      // A reorder built from a stale list may lose with 422; nothing else may fail.
      for (const result of results) {
        if (result.status === "rejected") {
          expect(statusOf(result.reason)).toBe(422)
        }
      }
      const after = await stagesOf(own, pipeline.id)
      const positions = after
        .map((stage) => stage.position)
        .sort((a, b) => a - b)
      expect(positions).toEqual(after.map((_stage, index) => index))
    })
  })

  describe("hostile ids", () => {
    test("deleteComment ignores a comment that belongs to another workspace", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      const foreignPipeline = await newPipeline(other)
      const foreignItem = await newItem(other, foreignPipeline.id, {
        contactId: other.contactIds[0],
      })
      const foreignComment = await pipelineItemContentService.addComment({
        workspaceId: other.workspaceId,
        pipelineId: foreignPipeline.id,
        itemId: foreignItem.id,
        text: "theirs",
        scope: token,
        actor,
      })

      await expect(
        pipelineItemContentService.deleteComment({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          commentId: foreignComment.id,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      expect(
        (await readItem(other, foreignPipeline.id, foreignItem.id))
          .commentCount,
      ).toBe(1)
    })

    test("removeAttachment ignores a file attached in another workspace", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      const foreignPipeline = await newPipeline(other)
      const foreignItem = await newItem(other, foreignPipeline.id, {
        contactId: other.contactIds[0],
      })
      await attach(other, foreignPipeline.id, foreignItem.id, other.mediaFileId)

      await expect(
        pipelineItemContentService.removeAttachment({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          mediaLibraryFileId: other.mediaFileId,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      expect(
        (await readItem(other, foreignPipeline.id, foreignItem.id)).attachments,
      ).toHaveLength(1)
    })

    test("attaching a file from another workspace is a 404 and attaches nothing", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)

      await expect(
        attach(own, pipeline.id, item.id, other.mediaFileId),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      expect((await readItem(own, pipeline.id, item.id)).attachments).toEqual(
        [],
      )
    })

    test("setMember and removeMember reject a member of another workspace", async () => {
      const pipeline = await newPipeline(own)

      await expect(
        pipelineMemberService.setMember({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          workspaceMemberId: other.memberId,
          permissions: {
            canView: true,
            canEdit: false,
            canDelete: false,
            canManageSettings: false,
          },
          scope: token,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })
      await expect(
        pipelineMemberService.removeMember({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          workspaceMemberId: other.memberId,
          scope: token,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      expect(await membersOf(own, pipeline.id)).toEqual([])
      const rows = await db
        .select({ id: pipelineMemberModel.id })
        .from(pipelineMemberModel)
        .where(eq(pipelineMemberModel.workspaceMemberId, other.memberId))
      expect(rows).toEqual([])
    })

    test("transfer rejects a destination pipeline or stage of another workspace and moves nothing", async () => {
      const source = await newPipeline(own, "Src")
      const item = await newItem(own, source.id)
      const destination = await newPipeline(own, "Dst")
      const foreignPipeline = await newPipeline(other)
      const [foreignStage] = await stagesOf(other, foreignPipeline.id)

      await expect(
        pipelineItemService.transfer({
          workspaceId: own.workspaceId,
          pipelineId: source.id,
          itemId: item.id,
          destinationPipelineId: foreignPipeline.id,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })
      await expect(
        pipelineItemService.transfer({
          workspaceId: own.workspaceId,
          pipelineId: source.id,
          itemId: item.id,
          destinationPipelineId: destination.id,
          destinationStageId: foreignStage.id,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      const unchanged = await readItem(own, source.id, item.id)
      expect(unchanged.item.pipelineId).toBe(source.id)
    })

    test("get, update, move and delete of another workspace's item are 404 and write nothing", async () => {
      const pipeline = await newPipeline(own)
      const [ownStage] = await stagesOf(own, pipeline.id)
      const foreignPipeline = await newPipeline(other)
      const foreignItem = await newItem(other, foreignPipeline.id, {
        contactId: other.contactIds[0],
      })
      const [foreignStage] = await stagesOf(other, foreignPipeline.id)
      const base = { workspaceId: own.workspaceId, scope: token, actor }
      const attempts = [
        // own workspace + own pipeline + foreign item id
        () => readItem(own, pipeline.id, foreignItem.id),
        () =>
          pipelineItemService.update({
            ...base,
            pipelineId: pipeline.id,
            itemId: foreignItem.id,
            fields: { title: "hijacked" },
          }),
        () =>
          pipelineItemService.move({
            ...base,
            pipelineId: pipeline.id,
            itemId: foreignItem.id,
            stageId: ownStage.id,
          }),
        () =>
          pipelineItemService.delete({
            ...base,
            pipelineId: pipeline.id,
            itemId: foreignItem.id,
          }),
        // own workspace + foreign pipeline id + foreign item id
        () => readItem(own, foreignPipeline.id, foreignItem.id),
        () =>
          pipelineItemService.update({
            ...base,
            pipelineId: foreignPipeline.id,
            itemId: foreignItem.id,
            fields: { title: "hijacked" },
          }),
        () =>
          pipelineItemService.move({
            ...base,
            pipelineId: foreignPipeline.id,
            itemId: foreignItem.id,
            stageId: foreignStage.id,
          }),
        () =>
          pipelineItemService.delete({
            ...base,
            pipelineId: foreignPipeline.id,
            itemId: foreignItem.id,
          }),
      ]

      for (const [index, attempt] of attempts.entries()) {
        await expect(attempt(), `attempt ${index}`).rejects.toMatchObject({
          httpStatusCode: 404,
        })
      }

      const intact = await readItem(other, foreignPipeline.id, foreignItem.id)
      expect(intact.item.title).toBe("Deal")
      expect(intact.item.stageId).toBe(foreignItem.stageId)
    })

    test("moving an own item to a stage of another workspace is a 404", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      const foreignPipeline = await newPipeline(other)
      const [foreignStage] = await stagesOf(other, foreignPipeline.id)

      await expect(
        pipelineItemService.move({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          stageId: foreignStage.id,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      expect((await readItem(own, pipeline.id, item.id)).item.stageId).toBe(
        item.stageId,
      )
    })
  })

  describe("cascades", () => {
    test("removing a workspace member removes its pipeline grants and item assignments", async () => {
      const pipeline = await newPipeline(own)
      await pipelineMemberService.setMember({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        workspaceMemberId: own.plainMemberId,
        permissions: {
          canView: true,
          canEdit: true,
          canDelete: false,
          canManageSettings: false,
        },
        scope: token,
      })
      const item = await newItem(own, pipeline.id, {
        fields: {
          title: "assigned",
          assigneeMemberIds: [own.plainMemberId, own.memberId],
        },
      })

      await db
        .delete(workspaceMemberModel)
        .where(eq(workspaceMemberModel.id, own.plainMemberId))

      expect(await membersOf(own, pipeline.id)).toEqual([])
      const assignees = await db
        .select({
          memberId: pipelineItemAssigneeModel.workspaceMemberId,
        })
        .from(pipelineItemAssigneeModel)
        .where(eq(pipelineItemAssigneeModel.itemId, item.id))
      expect(assignees.map((row) => row.memberId)).toEqual([own.memberId])
      expect((await readItem(own, pipeline.id, item.id)).item.id).toBe(item.id)
    })

    test("deleting a contact removes its items and keeps their activity, outside the mutation engine", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      const kept = await newItem(own, pipeline.id, {
        contactId: own.contactIds[1],
        fields: { title: "other contact" },
      })
      vi.clearAllMocks()

      await db
        .delete(contactModel)
        .where(eq(contactModel.id, own.contactIds[0]))

      const remaining = await db
        .select({ id: pipelineItemModel.id })
        .from(pipelineItemModel)
        .where(eq(pipelineItemModel.pipelineId, pipeline.id))
      expect(remaining.map((row) => row.id)).toEqual([kept.id])
      // docs/pipelines.md: no FK on activity, so history survives the contact.
      const activity = await db
        .select({ id: pipelineItemActivityModel.id })
        .from(pipelineItemActivityModel)
        .where(eq(pipelineItemActivityModel.itemId, item.id))
      expect(activity.length).toBeGreaterThan(0)
      // Documented exception: the FK cascade bypasses events, realtime and the
      // counts-cache invalidation (counts heal within the 60 s TTL).
      expect(mocks.emitPipelineItemEvent).not.toHaveBeenCalled()
      expect(mocks.queueWorkspaceRealtimeEvent).not.toHaveBeenCalled()
      expect(mocks.invalidateCacheByTags).not.toHaveBeenCalled()
    })
  })

  describe("activity history", () => {
    test("records move, won, reopen and lost with from/to columns and closedAt", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        name: "Negotiation",
        scope: token,
      })
      const item = await newItem(own, pipeline.id, {
        fields: { title: "history", value: 250 },
      })
      const closedAtAfter: Array<Date | null> = []
      const snapshot = async () =>
        closedAtAfter.push(
          (await readItem(own, pipeline.id, item.id)).item.closedAt,
        )

      await pipelineItemService.move({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        stageId: second.id,
        scope: token,
        actor,
      })
      await snapshot()
      await setStatus(own, pipeline.id, item.id, "won")
      await snapshot()
      await setStatus(own, pipeline.id, item.id, "open")
      await snapshot()
      await setStatus(own, pipeline.id, item.id, "lost")
      await snapshot()

      const history = (
        await pipelineItemQueryService.listActivity({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          scope: token,
        })
      ).items.sort(
        (a, b) =>
          a.occurredAt.getTime() - b.occurredAt.getTime() ||
          Number(BigInt(a.id) - BigInt(b.id)),
      )
      expect(history.map((row) => row.kind)).toEqual([
        "created",
        "stageChanged",
        "statusChanged",
        "statusChanged",
        "statusChanged",
      ])
      const [, moved, won, reopened, lost] = history
      expect([moved.fromStageId, moved.toStageId]).toEqual([
        item.stageId,
        second.id,
      ])
      expect([won.fromStatus, won.toStatus]).toEqual(["open", "won"])
      expect([reopened.fromStatus, reopened.toStatus]).toEqual(["won", "open"])
      expect([lost.fromStatus, lost.toStatus]).toEqual(["open", "lost"])
      // closedAt: untouched by a move, set on won, cleared on reopen, set on lost.
      expect(closedAtAfter.map((value) => value !== null)).toEqual([
        false,
        true,
        false,
        true,
      ])
    })
  })

  describe("analytics in a DST-crossing zone", () => {
    const record = async (pipelineId: string, occurredAts: string[]) => {
      await pipelineActivityRepository.insertMany(
        occurredAts.map((occurredAt) => ({
          workspaceId: own.workspaceId,
          pipelineId,
          itemId: "1",
          itemNumber: 1,
          itemTitle: "x",
          contactId: own.contactIds[0],
          kind: "created" as const,
          actorKind: "system" as const,
          occurredAt: new Date(occurredAt),
        })),
      )
    }

    const dailyCreated = async (
      pipelineId: string,
      from: string,
      to: string,
      timezone: string,
    ) => {
      const stats = await pipelineAnalyticsService.getStats({
        workspaceId: own.workspaceId,
        pipelineId,
        from,
        to,
        timezone,
        scope: token,
      })
      return {
        stats,
        byDay: Object.fromEntries(
          stats.daily.map((entry) => [entry.day, entry.created]),
        ),
      }
    }

    test("buckets events by the local day across the March spring-forward", async () => {
      const pipeline = await newPipeline(own)
      await record(pipeline.id, [
        "2026-03-07T04:59:00Z", // 23:59 EST on 03-06: outside the range
        "2026-03-08T04:30:00Z", // 23:30 EST on 03-07
        "2026-03-08T05:00:00Z", // 00:00 EST on 03-08: first instant of the short day
        "2026-03-08T12:00:00Z", // 08:00 EDT on 03-08
        "2026-03-09T03:59:59Z", // 23:59:59 EDT on 03-08: last instant of that day
        "2026-03-09T04:00:00Z", // 00:00 EDT on 03-09
      ])

      const { stats, byDay } = await dailyCreated(
        pipeline.id,
        "2026-03-07",
        "2026-03-09",
        "America/New_York",
      )

      expect(byDay).toEqual({
        "2026-03-07": 1,
        "2026-03-08": 3,
        "2026-03-09": 1,
      })
      expect(stats.current.created).toBe(5)
      expect(stats.range.timezone).toBe("America/New_York")
    })

    test("buckets events by the local day across the November fall-back", async () => {
      const pipeline = await newPipeline(own)
      await record(pipeline.id, [
        "2026-11-01T03:59:00Z", // 23:59 EDT on 10-31
        "2026-11-01T04:00:00Z", // 00:00 EDT on 11-01: first instant of the long day
        "2026-11-01T05:30:00Z", // 01:30 EDT (first pass)
        "2026-11-01T06:30:00Z", // 01:30 EST (second pass)
        "2026-11-02T04:59:00Z", // 23:59 EST on 11-01: last minute of that day
        "2026-11-02T05:00:00Z", // 00:00 EST on 11-02
      ])

      const { stats, byDay } = await dailyCreated(
        pipeline.id,
        "2026-10-31",
        "2026-11-02",
        "America/New_York",
      )

      expect(byDay).toEqual({
        "2026-10-31": 1,
        "2026-11-01": 4,
        "2026-11-02": 1,
      })
      expect(stats.current.created).toBe(6)
    })

    test("the same events bucket differently in UTC (control)", async () => {
      const pipeline = await newPipeline(own)
      await record(pipeline.id, ["2026-03-09T03:30:00Z"])

      const utc = await dailyCreated(
        pipeline.id,
        "2026-03-08",
        "2026-03-09",
        "UTC",
      )
      const newYork = await dailyCreated(
        pipeline.id,
        "2026-03-08",
        "2026-03-09",
        "America/New_York",
      )

      expect(utc.byDay).toEqual({ "2026-03-08": 0, "2026-03-09": 1 })
      expect(newYork.byDay).toEqual({ "2026-03-08": 1, "2026-03-09": 0 })
    })
  })

  describe("manual order concurrency", () => {
    type Placement = {
      beforeItemId?: string
      afterItemId?: string
      placement?: "top" | "bottom"
    }
    type Race = { pipelineId: string; stageA: string; stageB: string }

    const eTitle = (index: number) => `e${String(index).padStart(4, "0")}`

    const raceSetup = async (name: string): Promise<Race> => {
      const pipeline = await newPipeline(own, name)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      return { pipelineId: pipeline.id, stageA: first.id, stageB: second.id }
    }

    const create = (pipelineId: string, title: string, stageId?: string) =>
      newItem(own, pipelineId, { fields: { title, stageId } })

    const place = (
      race: Pick<Race, "pipelineId">,
      itemId: string,
      stageId: string,
      placement: Placement,
    ) =>
      pipelineItemService.move({
        workspaceId: own.workspaceId,
        pipelineId: race.pipelineId,
        itemId,
        stageId,
        ...placement,
        scope: token,
        actor,
      })

    const rowsOf = async (stageId: string) =>
      (
        await db.execute(
          sql`SELECT "id"::text AS id, "title" AS title, "position"::float8 AS position FROM "PipelineItem" WHERE "stageId" = ${stageId}::bigint ORDER BY "position", "id"`,
        )
      ).rows as { id: string; title: string; position: number }[]

    const orderOf = async (stageId: string) =>
      (await rowsOf(stageId)).map((row) => row.title)

    // Raw rows need ids and numbers no earlier seed of this run used.
    let seeded = 0
    const seedEqual = async (race: Race, count: number, fieldId?: string) => {
      seeded += 1
      const base = seeded * 10_000
      await db.execute(sql`
        INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","updatedAt","position")
        SELECT (2000000000000 + ${base}::bigint + g)::bigint, ${own.workspaceId}::bigint, ${race.pipelineId}::bigint, ${race.stageA}::bigint, ${own.contactIds[0]}::bigint, 100000 + ${base}::int + g, 'e' || lpad(g::text, 4, '0'), 'lost', 'low',
          CASE WHEN ${fieldId ?? null}::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object(${fieldId ?? null}::text, 'v') END,
          now(), now(), 100::float8
        FROM generate_series(1, ${count}::int) AS g`)
    }

    const idOfTitle = async (stageId: string, title: string) =>
      (await rowsOf(stageId)).find((row) => row.title === title)?.id as string

    /** Every outcome must be a success: a lock regression would show as a deadlock or a hang. */
    const expectAllFulfilled = (results: PromiseSettledResult<unknown>[]) => {
      for (const result of results) {
        if (result.status === "rejected") {
          throw result.reason
        }
      }
    }

    const expectDistinctAscending = async (stageId: string) => {
      const rows = await rowsOf(stageId)
      const positions = rows.map((row) => row.position)
      expect(new Set(positions).size).toBe(positions.length)
    }

    /** A test transaction that holds the stage-order locks until released. */
    const holdStageOrder = (stageIds: string[]) => {
      const held = barrier()
      const release = barrier()
      const done = db.transaction(async (tx) => {
        await lockStageOrder(tx, own.workspaceId, stageIds)
        held.open()
        await release.promise
      })
      return { held, release, done }
    }

    test("two placements into the same gap both land between its neighbours", async () => {
      for (let round = 0; round < 3; round += 1) {
        const race = await raceSetup(`Gap ${round}`)
        const a = await create(race.pipelineId, "a")
        await create(race.pipelineId, "b")
        const x = await create(race.pipelineId, "x")
        const y = await create(race.pipelineId, "y")
        // Board order: y, x, b, a. Both go directly above a, below b.
        expectAllFulfilled(
          await within(
            Promise.allSettled([
              place(race, x.id, race.stageA, { beforeItemId: a.id }),
              place(race, y.id, race.stageA, { beforeItemId: a.id }),
            ]),
          ),
        )

        const titles = await orderOf(race.stageA)
        expect(titles[0]).toBe("b")
        expect(titles.slice(1, 3).sort()).toEqual(["x", "y"])
        expect(titles[3]).toBe("a")
        await expectDistinctAscending(race.stageA)
      }
    })

    test("a respace racing a pipeline delete never deadlocks and the pipeline ends deleted", async () => {
      for (let round = 0; round < 3; round += 1) {
        const race = await raceSetup(`Delete ${round}`)
        await seedEqual(race, 8)
        const [mover, anchor] = [
          await idOfTitle(race.stageA, eTitle(5)),
          await idOfTitle(race.stageA, eTitle(2)),
        ]

        const results = await within(
          Promise.allSettled([
            place(race, mover, race.stageA, { beforeItemId: anchor }),
            pipelineService.delete({
              workspaceId: own.workspaceId,
              id: race.pipelineId,
              scope: token,
            }),
          ]),
        )

        // The delete always wins eventually; the placement either landed or
        // lost to it with a domain error, never a Postgres deadlock (40P01).
        expect(results[1]?.status).toBe("fulfilled")
        const placed = results[0]
        if (placed?.status === "rejected") {
          expect(placed.reason).toMatchObject({
            httpStatusCode: expect.any(Number),
          })
        }
        const left = await db.execute(
          sql`SELECT count(*)::int AS n FROM "PipelineItem" WHERE "pipelineId" = ${race.pipelineId}::bigint`,
        )
        expect(Number(left.rows[0]?.n)).toBe(0)
      }
    })

    test("a create racing a placement to the top keeps both on top with distinct positions", async () => {
      for (let round = 0; round < 3; round += 1) {
        const race = await raceSetup(`Top ${round}`)
        await create(race.pipelineId, "a")
        const b = await create(race.pipelineId, "b")

        expectAllFulfilled(
          await within(
            Promise.allSettled([
              create(race.pipelineId, "n"),
              place(race, b.id, race.stageA, { placement: "bottom" }),
            ]),
          ),
        )

        expect((await orderOf(race.stageA)).sort()).toEqual(["a", "b", "n"])
        await expectDistinctAscending(race.stageA)
      }
    })

    describe("a respace racing", () => {
      type Competitor = (race: Race) => Promise<unknown>

      const competitors: [string, Competitor][] = [
        ["a create", (race) => create(race.pipelineId, "fresh", race.stageA)],
        [
          "a transfer into the stage",
          async (race) => {
            const elsewhere = await newPipeline(own, "Elsewhere")
            const moved = await newItem(own, elsewhere.id)
            return await pipelineItemService.transfer({
              workspaceId: own.workspaceId,
              pipelineId: elsewhere.id,
              itemId: moved.id,
              destinationPipelineId: race.pipelineId,
              destinationStageId: race.stageA,
              scope: token,
              actor,
            })
          },
        ],
        [
          "a stage change into the stage",
          async (race) => {
            const z = await create(race.pipelineId, "z", race.stageB)
            return await pipelineItemService.update({
              workspaceId: own.workspaceId,
              pipelineId: race.pipelineId,
              itemId: z.id,
              fields: { stageId: race.stageA },
              scope: token,
              actor,
            })
          },
        ],
        [
          "a drain batch into the stage",
          async (race) => {
            await create(race.pipelineId, "z1", race.stageB)
            await create(race.pipelineId, "z2", race.stageB)
            return await pipelineStageBulkService.deleteStage({
              workspaceId: own.workspaceId,
              pipelineId: race.pipelineId,
              stageId: race.stageB,
              moveItemsToStageId: race.stageA,
              scope: token,
              actor,
            })
          },
        ],
      ]

      test.each(competitors)(
        "%s keeps the placed item exactly in its spot",
        async (_name, competitor) => {
          for (let round = 0; round < 2; round += 1) {
            const race = await raceSetup(`Respace ${round}`)
            await seedEqual(race, 20)
            const m = await create(race.pipelineId, "m", race.stageA)
            await db.execute(
              sql`UPDATE "PipelineItem" SET "position" = 5000 WHERE "id" = ${m.id}::bigint`,
            )
            const anchor = await idOfTitle(race.stageA, eTitle(10))

            expectAllFulfilled(
              await within(
                Promise.allSettled([
                  place(race, m.id, race.stageA, { afterItemId: anchor }),
                  competitor(race),
                ]),
              ),
            )

            const titles = (await orderOf(race.stageA)).filter((title) =>
              SEEDED_OR_MOVED_TITLE.test(title),
            )
            expect(titles).toEqual([
              ...Array.from({ length: 10 }, (_, i) => eTitle(i + 1)),
              "m",
              ...Array.from({ length: 10 }, (_, i) => eTitle(i + 11)),
            ])
            await expectDistinctAscending(race.stageA)
          }
        },
        60_000,
      )
    })

    test("two opposite moves between the same two stages never deadlock", async () => {
      for (let round = 0; round < 3; round += 1) {
        const race = await raceSetup(`Opposite ${round}`)
        const p = await create(race.pipelineId, "p", race.stageA)
        const q = await create(race.pipelineId, "q", race.stageB)

        expectAllFulfilled(
          await within(
            Promise.allSettled([
              place(race, p.id, race.stageB, { placement: "top" }),
              place(race, q.id, race.stageA, { placement: "top" }),
            ]),
          ),
        )

        expect(await orderOf(race.stageA)).toEqual(["q"])
        expect(await orderOf(race.stageB)).toEqual(["p"])
      }
    })

    test("a reorder racing the deletion of its stage never deadlocks", async () => {
      for (let round = 0; round < 3; round += 1) {
        const race = await raceSetup(`Stage delete ${round}`)
        const a1 = await create(race.pipelineId, "a1", race.stageA)
        const a2 = await create(race.pipelineId, "a2", race.stageA)

        const [reorder, removal] = await within(
          Promise.allSettled([
            place(race, a1.id, race.stageA, { beforeItemId: a2.id }),
            pipelineStageBulkService.deleteStage({
              workspaceId: own.workspaceId,
              pipelineId: race.pipelineId,
              stageId: race.stageA,
              moveItemsToStageId: race.stageB,
              scope: token,
              actor,
            }),
          ]),
        )

        expect(removal.status).toBe("fulfilled")
        if (reorder.status === "rejected") {
          expect(String(reorder.reason)).not.toContain("deadlock")
          expect([404, 409, 422]).toContain(statusOf(reorder.reason))
        }
        expect((await orderOf(race.stageB)).sort()).toEqual(["a1", "a2"])
      }
    })

    test("a field-key strip racing a respace never deadlocks and strips every row", async () => {
      for (let round = 0; round < 2; round += 1) {
        const race = await raceSetup(`Strip ${round}`)
        const field = await pipelineStructureService.createField({
          workspaceId: own.workspaceId,
          pipelineId: race.pipelineId,
          scope: token,
          values: {
            name: "Plan",
            referenceName: `plan_${round}`,
            type: "shortText",
            required: false,
          },
        })
        await seedEqual(race, 20, field.id)
        const m = await create(race.pipelineId, "m", race.stageA)
        const anchor = await idOfTitle(race.stageA, eTitle(10))

        expectAllFulfilled(
          await within(
            Promise.allSettled([
              place(race, m.id, race.stageA, { afterItemId: anchor }),
              pipelineStructureService.deleteField({
                workspaceId: own.workspaceId,
                pipelineId: race.pipelineId,
                fieldId: field.id,
                scope: token,
              }),
            ]),
          ),
        )

        const left = await db.execute(
          sql`SELECT count(*)::int AS n FROM "PipelineItem" WHERE "pipelineId" = ${race.pipelineId}::bigint AND "fieldValues" ? ${field.id}::text`,
        )
        expect(Number(left.rows[0]?.n)).toBe(0)
      }
    }, 60_000)

    test("a queued drain batch racing a placement into its destination keeps both consistent", async () => {
      const race = await raceSetup("Queued race")
      const m = await create(race.pipelineId, "m", race.stageA)
      for (let index = 0; index < 4; index += 1) {
        await create(race.pipelineId, `q${index}`, race.stageB)
      }
      await db.execute(
        sql`UPDATE "PipelineStage" SET "bulkJobId" = 'job-q' WHERE "id" = ${race.stageB}::bigint`,
      )

      expectAllFulfilled(
        await within(
          Promise.allSettled([
            place(race, m.id, race.stageA, { placement: "top" }),
            pipelineStageBulkService.processQueued({
              workspaceId: own.workspaceId,
              pipelineId: race.pipelineId,
              stageId: race.stageB,
              bulkJobId: "job-q",
              moveItemsToStageId: race.stageA,
              actorUserId: null,
              actorKind: "user",
              actorSourceId: null,
            }),
          ]),
        ),
      )

      expect((await orderOf(race.stageA)).sort()).toEqual([
        "m",
        "q0",
        "q1",
        "q2",
        "q3",
      ])
      await expectDistinctAscending(race.stageA)
    })

    test("placing next to an item that is being deleted is a success or a 422, never a server error", async () => {
      for (let round = 0; round < 3; round += 1) {
        const race = await raceSetup(`Anchor delete ${round}`)
        const a = await create(race.pipelineId, "a", race.stageA)
        const b = await create(race.pipelineId, "b", race.stageA)

        const [placed, removed] = await within(
          Promise.allSettled([
            place(race, a.id, race.stageA, { afterItemId: b.id }),
            pipelineItemService.delete({
              workspaceId: own.workspaceId,
              pipelineId: race.pipelineId,
              itemId: b.id,
              scope: token,
              actor,
            }),
          ]),
        )

        expect(removed.status).toBe("fulfilled")
        if (placed.status === "rejected") {
          expect(statusOf(placed.reason)).toBe(422)
        }
        expect(await orderOf(race.stageA)).toEqual(["a"])
      }
    })

    test("a respace skips a row that is deleted while it runs", async () => {
      for (let round = 0; round < 2; round += 1) {
        const race = await raceSetup(`Respace delete ${round}`)
        await seedEqual(race, 20)
        const m = await create(race.pipelineId, "m", race.stageA)
        await db.execute(
          sql`UPDATE "PipelineItem" SET "position" = 5000 WHERE "id" = ${m.id}::bigint`,
        )
        const anchor = await idOfTitle(race.stageA, eTitle(10))
        const doomed = await idOfTitle(race.stageA, eTitle(9))
        const original = pipelineItemRepository.listRespaceWindow.bind(
          pipelineItemRepository,
        )
        let windowHeldDoomed = false
        const spy = vi
          .spyOn(pipelineItemRepository, "listRespaceWindow")
          .mockImplementation(async (input, tx) => {
            const window = await original(input, tx)
            if (!windowHeldDoomed) {
              windowHeldDoomed = [...window.below, ...window.above].some(
                (row) => row.id === doomed,
              )
              // The respace has read its window with the doomed row in it;
              // the delete (no stage-order key) commits before it writes.
              await pipelineItemService.delete({
                workspaceId: own.workspaceId,
                pipelineId: race.pipelineId,
                itemId: doomed,
                scope: token,
                actor,
              })
            }
            return window
          })
        try {
          await within(place(race, m.id, race.stageA, { afterItemId: anchor }))
        } finally {
          spy.mockRestore()
        }

        expect(windowHeldDoomed).toBe(true)
        const titles = await orderOf(race.stageA)
        expect(titles).toEqual([
          ...[1, 2, 3, 4, 5, 6, 7, 8].map(eTitle),
          eTitle(10),
          "m",
          ...Array.from({ length: 10 }, (_, i) => eTitle(i + 11)),
        ])
        await expectDistinctAscending(race.stageA)
      }
    }, 60_000)

    describe("every position or membership writer waits for the stage-order lock", () => {
      type Waiter = {
        /** The stage whose stage-order lock the test holds. */
        heldStageId: string
        run: () => Promise<unknown>
      }

      const writers: [string, (race: Race) => Promise<Waiter>][] = [
        [
          "create",
          async (race) => ({
            heldStageId: race.stageA,
            run: () => create(race.pipelineId, "n", race.stageA),
          }),
        ],
        [
          "a placement",
          async (race) => {
            const x = await create(race.pipelineId, "x", race.stageA)
            const y = await create(race.pipelineId, "y", race.stageA)
            return {
              heldStageId: race.stageA,
              run: () => place(race, x.id, race.stageA, { beforeItemId: y.id }),
            }
          },
        ],
        [
          "a stage change",
          async (race) => {
            const z = await create(race.pipelineId, "z", race.stageB)
            return {
              heldStageId: race.stageA,
              run: () =>
                pipelineItemService.update({
                  workspaceId: own.workspaceId,
                  pipelineId: race.pipelineId,
                  itemId: z.id,
                  fields: { stageId: race.stageA },
                  scope: token,
                  actor,
                }),
            }
          },
        ],
        [
          "a transfer into the stage",
          async (race) => {
            const elsewhere = await newPipeline(own, "Elsewhere")
            const moved = await newItem(own, elsewhere.id)
            return {
              heldStageId: race.stageA,
              run: () =>
                pipelineItemService.transfer({
                  workspaceId: own.workspaceId,
                  pipelineId: elsewhere.id,
                  itemId: moved.id,
                  destinationPipelineId: race.pipelineId,
                  destinationStageId: race.stageA,
                  scope: token,
                  actor,
                }),
            }
          },
        ],
        [
          "a pipeline delete drain batch",
          async (race) => {
            await create(race.pipelineId, "z")
            return {
              heldStageId: race.stageA,
              run: () =>
                pipelineService.delete({
                  workspaceId: own.workspaceId,
                  id: race.pipelineId,
                  scope: token,
                }),
            }
          },
        ],
        [
          "an inline stage drain",
          async (race) => {
            await create(race.pipelineId, "z", race.stageB)
            return {
              heldStageId: race.stageA,
              run: () =>
                pipelineStageBulkService.deleteStage({
                  workspaceId: own.workspaceId,
                  pipelineId: race.pipelineId,
                  stageId: race.stageB,
                  moveItemsToStageId: race.stageA,
                  scope: token,
                  actor,
                }),
            }
          },
        ],
        [
          "a queued drain batch",
          async (race) => {
            await create(race.pipelineId, "z", race.stageB)
            await db.execute(
              sql`UPDATE "PipelineStage" SET "bulkJobId" = 'job-w' WHERE "id" = ${race.stageB}::bigint`,
            )
            return {
              heldStageId: race.stageA,
              run: () =>
                pipelineStageBulkService.processQueued({
                  workspaceId: own.workspaceId,
                  pipelineId: race.pipelineId,
                  stageId: race.stageB,
                  bulkJobId: "job-w",
                  moveItemsToStageId: race.stageA,
                  actorUserId: null,
                  actorKind: "user",
                  actorSourceId: null,
                }),
            }
          },
        ],
        [
          "a field-key strip",
          async (race) => {
            const field = await pipelineStructureService.createField({
              workspaceId: own.workspaceId,
              pipelineId: race.pipelineId,
              scope: token,
              values: {
                name: "Plan",
                referenceName: "plan_wait",
                type: "shortText",
                required: false,
              },
            })
            await seedEqual(race, 3, field.id)
            return {
              heldStageId: race.stageA,
              run: () =>
                pipelineStructureService.deleteField({
                  workspaceId: own.workspaceId,
                  pipelineId: race.pipelineId,
                  fieldId: field.id,
                  scope: token,
                }),
            }
          },
        ],
      ]

      test.each(writers)(
        "%s",
        async (_name, prepare) => {
          const race = await raceSetup("Waits")
          const writer = await prepare(race)
          const hold = holdStageOrder([writer.heldStageId])
          let outcome: Promise<unknown> | undefined
          try {
            await within(heldBy(hold.held.promise, hold.done))
            outcome = writer.run()
            // The writer reached the held key and queues behind it.
            await within(
              waitUntilSomeoneWaitsOnAnAdvisoryLock(
                stageOrderLockKey(own.workspaceId, writer.heldStageId),
              ),
            )
          } finally {
            hold.release.open()
            await Promise.allSettled([hold.done, outcome])
          }

          await within(outcome as Promise<unknown>)
        },
        30_000,
      )
    })

    test("a holder that changes stage before the strip's re-read is stripped by the next batch, even the lowest id", async () => {
      const race = await raceSetup("Strip moved")
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: race.pipelineId,
        scope: token,
        values: {
          name: "Plan",
          referenceName: "plan_moved",
          type: "shortText",
          required: false,
        },
      })
      await seedEqual(race, 6, field.id)
      const movedId = await idOfTitle(race.stageA, eTitle(1))
      const original =
        pipelineRepository.listFieldKeyHolders.bind(pipelineRepository)
      let moved = false
      const spy = vi
        .spyOn(pipelineRepository, "listFieldKeyHolders")
        .mockImplementation(async (input, tx) => {
          if ("ids" in input && !moved) {
            moved = true
            // Committed on another connection, after the candidates were read.
            await db.execute(
              sql`UPDATE "PipelineItem" SET "stageId" = ${race.stageB}::bigint WHERE "id" = ${movedId}::bigint`,
            )
          }
          return await original(input, tx)
        })
      try {
        await within(
          pipelineStructureService.deleteField({
            workspaceId: own.workspaceId,
            pipelineId: race.pipelineId,
            fieldId: field.id,
            scope: token,
          }),
        )
      } finally {
        spy.mockRestore()
      }

      expect(moved).toBe(true)
      const left = await db.execute(
        sql`SELECT count(*)::int AS n FROM "PipelineItem" WHERE "pipelineId" = ${race.pipelineId}::bigint AND "fieldValues" ? ${field.id}::text`,
      )
      expect(Number(left.rows[0]?.n)).toBe(0)
    })

    test("a holder that changes stage on every batch is still stripped", async () => {
      const race = await raceSetup("Strip chasing")
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: race.pipelineId,
        scope: token,
        values: {
          name: "Plan",
          referenceName: "plan_chase",
          type: "shortText",
          required: false,
        },
      })
      await seedEqual(race, 1, field.id)
      const holderId = await idOfTitle(race.stageA, eTitle(1))
      const original =
        pipelineRepository.listFieldKeyHolders.bind(pipelineRepository)
      let moves = 0
      const spy = vi
        .spyOn(pipelineRepository, "listFieldKeyHolders")
        .mockImplementation(async (input, tx) => {
          if ("ids" in input) {
            moves += 1
            // Flip the holder to the other stage after every candidate read.
            await db.execute(
              sql`UPDATE "PipelineItem" SET "stageId" = CASE WHEN "stageId" = ${race.stageA}::bigint THEN ${race.stageB}::bigint ELSE ${race.stageA}::bigint END WHERE "id" = ${holderId}::bigint`,
            )
          }
          return await original(input, tx)
        })
      try {
        await within(
          pipelineStructureService.deleteField({
            workspaceId: own.workspaceId,
            pipelineId: race.pipelineId,
            fieldId: field.id,
            scope: token,
          }),
        )
      } finally {
        spy.mockRestore()
      }

      expect(moves).toBeGreaterThanOrEqual(5)
      const left = await db.execute(
        sql`SELECT count(*)::int AS n FROM "PipelineItem" WHERE "pipelineId" = ${race.pipelineId}::bigint AND "fieldValues" ? ${field.id}::text`,
      )
      expect(Number(left.rows[0]?.n)).toBe(0)
    })

    test("a respace that cannot lock its neighbours in time is a 409, not a server error", async () => {
      const race = await raceSetup("Respace timeout")
      await seedEqual(race, 5)
      const m = await create(race.pipelineId, "m", race.stageA)
      await db.execute(
        sql`UPDATE "PipelineItem" SET "position" = 5000 WHERE "id" = ${m.id}::bigint`,
      )
      const anchor = await idOfTitle(race.stageA, eTitle(2))
      const neighbour = await idOfTitle(race.stageA, eTitle(3))
      const held = barrier()
      const release = barrier()
      // Another connection keeps a window row locked past the respace's cap.
      const holder = db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT 1 FROM "PipelineItem" WHERE "id" = ${neighbour}::bigint FOR UPDATE`,
        )
        held.open()
        await release.promise
      })
      try {
        await within(heldBy(held.promise, holder))
        await expect(
          within(
            place(race, m.id, race.stageA, { afterItemId: anchor }),
            30_000,
          ),
        ).rejects.toMatchObject({ httpStatusCode: 409, code: "conflict" })
      } finally {
        release.open()
        await holder
      }
    }, 60_000)

    test("a stage-order lock held past the lock timeout is a 409 with no writes or effects", async () => {
      const race = await raceSetup("Lock timeout")
      const a = await create(race.pipelineId, "a")
      const b = await create(race.pipelineId, "b")
      const before = await rowsOf(race.stageA)
      mocks.queueWorkspaceRealtimeEvent.mockClear()
      const hold = holdStageOrder([race.stageA])
      try {
        await within(heldBy(hold.held.promise, hold.done))
        await expect(
          within(place(race, a.id, race.stageA, { afterItemId: b.id }), 30_000),
        ).rejects.toMatchObject({ httpStatusCode: 409, code: "conflict" })
        await expect(
          within(create(race.pipelineId, "c", race.stageA), 30_000),
        ).rejects.toMatchObject({ httpStatusCode: 409, code: "conflict" })
      } finally {
        hold.release.open()
        await hold.done
      }

      expect(await rowsOf(race.stageA)).toEqual(before)
      expect(mocks.queueWorkspaceRealtimeEvent).not.toHaveBeenCalled()
    }, 60_000)

    test("background batches wait on a stage-order key past the request timeout instead of failing", async () => {
      const race = await raceSetup("Unbounded")
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: race.pipelineId,
        scope: token,
        values: {
          name: "Plan",
          referenceName: "plan_unbounded",
          type: "shortText",
          required: false,
        },
      })
      await seedEqual(race, 3, field.id)
      await create(race.pipelineId, "z", race.stageB)
      await db.execute(
        sql`UPDATE "PipelineStage" SET "bulkJobId" = 'job-u' WHERE "id" = ${race.stageB}::bigint`,
      )
      const hold = holdStageOrder([race.stageA])
      let strip: Promise<unknown> | undefined
      let drain: Promise<unknown> | undefined
      try {
        await within(heldBy(hold.held.promise, hold.done))
        strip = pipelineStructureService.deleteField({
          workspaceId: own.workspaceId,
          pipelineId: race.pipelineId,
          fieldId: field.id,
          scope: token,
        })
        // The strip alone first: it must be the one queued on stage A's key,
        // not on the structure lock a drain taking it first would hold.
        const keyA = stageOrderLockKey(own.workspaceId, race.stageA)
        await within(waitUntilSomeoneWaitsOnAnAdvisoryLock(keyA))
        drain = pipelineStageBulkService.processQueued({
          workspaceId: own.workspaceId,
          pipelineId: race.pipelineId,
          stageId: race.stageB,
          bulkJobId: "job-u",
          moveItemsToStageId: race.stageA,
          actorUserId: null,
          actorKind: "user",
          actorSourceId: null,
        })
        await within(waitUntilSomeoneWaitsOnAnAdvisoryLock(keyA, 2))
        // Longer than the 10s a request path would wait.
        await new Promise((resolve) => setTimeout(resolve, 11_000))
      } finally {
        hold.release.open()
        await Promise.allSettled([hold.done, strip, drain])
      }

      await within(strip as Promise<unknown>)
      await within(drain as Promise<unknown>)
      const left = await db.execute(
        sql`SELECT count(*)::int AS n FROM "PipelineItem" WHERE "pipelineId" = ${race.pipelineId}::bigint AND "fieldValues" ? ${field.id}::text`,
      )
      expect(Number(left.rows[0]?.n)).toBe(0)
      expect(await orderOf(race.stageB)).toEqual([])
    }, 60_000)

    test("flow and trigger writes (system scope) wait past the request timeout instead of failing", async () => {
      const race = await raceSetup("System wait")
      const system = { kind: "system" } as const
      const inB = await create(race.pipelineId, "b", race.stageB)
      const elsewhere = await newPipeline(own, "Elsewhere")
      // Its own contact, and a non-open create: no shared open-limit key
      // queues one write behind another before they reach stage A's key.
      const foreign = await newItem(own, elsewhere.id, {
        contactId: own.contactIds[1],
      })
      const keyA = stageOrderLockKey(own.workspaceId, race.stageA)
      const hold = holdStageOrder([race.stageA])
      let writes: Promise<unknown>[] = []
      try {
        await within(heldBy(hold.held.promise, hold.done))
        writes = [
          newItem(own, race.pipelineId, {
            fields: {
              title: "flow-created",
              stageId: race.stageA,
              status: "won",
            },
            scope: system,
          }),
          pipelineItemService.update({
            workspaceId: own.workspaceId,
            pipelineId: race.pipelineId,
            itemId: inB.id,
            fields: { stageId: race.stageA },
            scope: system,
            actor,
          }),
          pipelineItemService.transfer({
            workspaceId: own.workspaceId,
            pipelineId: elsewhere.id,
            itemId: foreign.id,
            destinationPipelineId: race.pipelineId,
            destinationStageId: race.stageA,
            scope: system,
            actor,
          }),
        ]
        await within(waitUntilSomeoneWaitsOnAnAdvisoryLock(keyA, 3))
        // Longer than the 10s a request path would wait.
        await new Promise((resolve) => setTimeout(resolve, 11_000))
      } finally {
        hold.release.open()
        await Promise.allSettled([hold.done, ...writes])
      }

      expectAllFulfilled(await within(Promise.allSettled(writes)))
      expect((await rowsOf(race.stageA)).length).toBe(3)
    }, 60_000)

    test("a deadlock inside a respace is a 409 that rolls everything back", async () => {
      const race = await raceSetup("Respace deadlock")
      await seedEqual(race, 5)
      const m = await create(race.pipelineId, "m", race.stageA)
      await db.execute(
        sql`UPDATE "PipelineItem" SET "position" = 5000 WHERE "id" = ${m.id}::bigint`,
      )
      const anchor = await idOfTitle(race.stageA, eTitle(2))
      const before = await rowsOf(race.stageA)
      mocks.queueWorkspaceRealtimeEvent.mockClear()
      const original = pipelineItemRepository.setPositions.bind(
        pipelineItemRepository,
      )
      let writes = 0
      const spy = vi
        .spyOn(pipelineItemRepository, "setPositions")
        .mockImplementation(async (input, tx) => {
          // Write first, so only the rollback can explain unchanged rows.
          await original(input, tx)
          throw new DrizzleQueryError(
            "update PipelineItem",
            [],
            Object.assign(new Error("deadlock detected"), { code: "40P01" }),
          )
        })
      try {
        await expect(
          within(place(race, m.id, race.stageA, { afterItemId: anchor })),
        ).rejects.toMatchObject({ httpStatusCode: 409, code: "conflict" })
      } finally {
        writes = spy.mock.calls.length
        spy.mockRestore()
      }

      expect(writes).toBeGreaterThan(0)
      expect(await rowsOf(race.stageA)).toEqual(before)
      expect(mocks.queueWorkspaceRealtimeEvent).not.toHaveBeenCalled()
    })

    describe("a stage that changes between the peek and the row lock", () => {
      const withStageChangedBeforeLock = async (
        changes: number,
        itemId: string,
        stageIds: string[],
        run: () => Promise<unknown>,
      ) => {
        const original = pipelineItemRepository.lockForUpdate.bind(
          pipelineItemRepository,
        )
        let calls = 0
        const spy = vi
          .spyOn(pipelineItemRepository, "lockForUpdate")
          .mockImplementation(async (input, tx) => {
            if (calls < changes) {
              // Another writer commits a stage change right before our lock.
              await db.execute(
                sql`UPDATE "PipelineItem" SET "stageId" = ${stageIds[calls % stageIds.length]}::bigint WHERE "id" = ${itemId}::bigint`,
              )
            }
            calls += 1
            return await original(input, tx)
          })
        try {
          return await Promise.allSettled([run()]).then(([result]) => ({
            result,
            lockAttempts: spy.mock.calls.length,
          }))
        } finally {
          spy.mockRestore()
        }
      }

      test("restarts the transaction once and then succeeds, emitting the event once", async () => {
        const race = await raceSetup("Retry")
        const third = await pipelineStructureService.createStage({
          workspaceId: own.workspaceId,
          pipelineId: race.pipelineId,
          scope: token,
          name: "Third",
        })
        const x = await create(race.pipelineId, "x", race.stageA)
        mocks.emitPipelineItemEvent.mockClear()

        const { result, lockAttempts } = await withStageChangedBeforeLock(
          1,
          x.id,
          [third.id],
          () => place(race, x.id, race.stageB, { placement: "top" }),
        )

        expect(result.status).toBe("fulfilled")
        expect(lockAttempts).toBe(2)
        expect(await orderOf(race.stageB)).toEqual(["x"])
        const moved = mocks.emitPipelineItemEvent.mock.calls.filter(
          ([type]) => type === "pipelineItemMovedToStage",
        )
        expect(moved).toHaveLength(1)
        expect(moved[0]?.[3]).toMatchObject({ fromStageName: "Third" })
      })

      test("a second mismatch is a 409 with nothing emitted", async () => {
        const race = await raceSetup("Retry twice")
        const third = await pipelineStructureService.createStage({
          workspaceId: own.workspaceId,
          pipelineId: race.pipelineId,
          scope: token,
          name: "Third",
        })
        const x = await create(race.pipelineId, "x", race.stageA)
        mocks.emitPipelineItemEvent.mockClear()
        mocks.queueWorkspaceRealtimeEvent.mockClear()

        const { result, lockAttempts } = await withStageChangedBeforeLock(
          2,
          x.id,
          [third.id, race.stageA],
          () => place(race, x.id, race.stageB, { placement: "top" }),
        )

        expect(result.status).toBe("rejected")
        expect(statusOf((result as PromiseRejectedResult).reason)).toBe(409)
        expect(lockAttempts).toBe(2)
        expect(mocks.emitPipelineItemEvent).not.toHaveBeenCalled()
        expect(mocks.queueWorkspaceRealtimeEvent).not.toHaveBeenCalled()
        expect(await orderOf(race.stageB)).toEqual([])
      })

      test("a transfer restarts the same way", async () => {
        const race = await raceSetup("Retry transfer")
        const third = await pipelineStructureService.createStage({
          workspaceId: own.workspaceId,
          pipelineId: race.pipelineId,
          scope: token,
          name: "Third",
        })
        const destination = await newPipeline(own, "Destination")
        const x = await create(race.pipelineId, "x", race.stageA)

        const { result, lockAttempts } = await withStageChangedBeforeLock(
          1,
          x.id,
          [third.id],
          () =>
            pipelineItemService.transfer({
              workspaceId: own.workspaceId,
              pipelineId: race.pipelineId,
              itemId: x.id,
              destinationPipelineId: destination.id,
              scope: token,
              actor,
            }),
        )

        expect(result.status).toBe("fulfilled")
        expect(lockAttempts).toBe(2)
      })
    })
  })
})
