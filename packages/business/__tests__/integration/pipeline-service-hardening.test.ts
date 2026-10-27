// @vitest-environment node

/**
 * Real-database hardening checks for the pipeline services: creator rights per
 * caller kind, assignment effects, races on the open-item limit / idempotency /
 * stage positions, hostile ids, FK cascades, activity history and DST-safe
 * analytics. Complements pipeline-service.test.ts and runs only against an
 * explicitly configured local database with the pipelines migration applied.
 */

import { db, eq, inArray } from "@chatbotx.io/database/client"
import { pipelineActivityRepository } from "@chatbotx.io/database/repositories"
import {
  contactModel,
  inboxTeamModel,
  mediaLibraryFileModel,
  pipelineItemActivityModel,
  pipelineItemAssigneeModel,
  pipelineItemModel,
  pipelineMemberModel,
  userModel,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

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
})
