// @vitest-environment node

/**
 * Real-database checks for the pipeline services: numbering, the open-item
 * limit under concurrency, idempotency, workspace scoping of every referenced
 * id, transfer, stage removal (inline and queued) and post-commit effects.
 * Runs only against an explicitly configured local database with the
 * pipelines migration applied.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import { pipelineStageRepository } from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  contactModel,
  inboxModel,
  inboxTeamModel,
  mediaLibraryFileModel,
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
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
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

const { dispatchAuditRecord } = await import("../../src/audit/dispatcher")
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
const { pipelineTemplateService } = await import(
  "../../src/pipeline/pipeline-template.service"
)
const { pipelineItemQueryService } = await import(
  "../../src/pipeline/item-query.service"
)
const { pipelineAnalyticsService } = await import(
  "../../src/pipeline/analytics.service"
)
const { dispatchPipelineEffects } = await import(
  "../../src/pipeline/mutation-engine"
)
const { invalidateCacheByTags } = await import("@chatbotx.io/redis")
const {
  pipelineStageBulkJobId,
  pipelineStageBulkService,
  STAGE_CLAIM_ENQUEUE_GRACE_MS,
  stageClaimCreatedAt,
} = await import("../../src/pipeline/stage-bulk.service")

type Fixture = {
  userId: string
  workspaceId: string
  memberId: string
  contactIds: string[]
  teamId: string
  mediaFileId: string
}

const databaseUrl = realDatabaseUrl()
const token = { kind: "workspaceToken" } as const
const actor = { kind: "user", userId: null, sourceId: null } as const

describe.skipIf(!databaseUrl)("pipeline services", () => {
  let own: Fixture
  let other: Fixture

  const createFixture = async (label: string): Promise<Fixture> => {
    const suffix = `${label}-${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(userModel)
      .values({ email: `pipeline-svc-${suffix}@example.test` })
      .returning({ id: userModel.id })
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `pipeline-svc-${suffix}`, ownerId: user.id })
      .returning({ id: workspaceModel.id })
    const [member] = await db
      .insert(workspaceMemberModel)
      .values({ workspaceId: workspace.id, userId: user.id, role: "owner" })
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
      userId: user.id,
      workspaceId: workspace.id,
      memberId: member.id,
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
    await db.delete(userModel).where(eq(userModel.id, fixture.userId))
  }

  const newPipeline = async (fixture: Fixture, name = "Sales") =>
    await pipelineService.create({
      workspaceId: fixture.workspaceId,
      type: "opportunity",
      name,
      scope: token,
      actor,
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

  const stagesOf = async (fixture: Fixture, pipelineId: string) =>
    (
      await pipelineService.get({
        workspaceId: fixture.workspaceId,
        id: pipelineId,
        scope: token,
      })
    ).stages

  beforeEach(async () => {
    vi.clearAllMocks()
    own = await createFixture("own")
    other = await createFixture("other")
  })

  afterEach(async () => {
    await cleanup(own)
    await cleanup(other)
  })

  describe("pipelines", () => {
    test("creates the first stage and status labels for the type", async () => {
      const ticket = await pipelineService.create({
        workspaceId: own.workspaceId,
        type: "ticket",
        name: "Support",
        scope: token,
        actor,
      })

      const stages = await stagesOf(own, ticket.id)
      expect(stages.map((stage) => stage.name)).toEqual(["New Issue"])
      expect(ticket.settings.statusLabels.won).toBe("Resolved")
      expect(ticket.currency).toBe("VND")
    })

    test("suffixes a duplicate name and reference name instead of failing", async () => {
      const first = await newPipeline(own)
      const second = await newPipeline(own)

      expect(first.name).toBe("Sales")
      expect(second.name).toBe("Sales 2")
      expect(second.referenceName).toBe("sales_2")
    })

    test("concurrent creates with the same name all succeed with distinct names", async () => {
      const created = await Promise.all(
        Array.from({ length: 4 }, () => newPipeline(own)),
      )

      expect(new Set(created.map((p) => p.name)).size).toBe(4)
      expect(new Set(created.map((p) => p.referenceName)).size).toBe(4)
    })

    test("duplicates structure but not items", async () => {
      const source = await newPipeline(own)
      await newItem(own, source.id)

      const copy = await pipelineService.duplicate({
        workspaceId: own.workspaceId,
        id: source.id,
        scope: token,
        actor,
      })

      const list = await pipelineService.list({
        workspaceId: own.workspaceId,
        scope: token,
      })
      const counts = Object.fromEntries(
        list.map((entry) => [entry.pipeline.id, entry.itemsCount]),
      )
      expect(counts[source.id]).toBe(1)
      expect(counts[copy.id]).toBe(0)
      expect(await stagesOf(own, copy.id)).toHaveLength(1)
    })

    test("a plain member who duplicates gets full rights on the copy", async () => {
      const source = await newPipeline(own)
      const plain = {
        kind: "member",
        workspaceMemberId: own.memberId,
        isWorkspaceAdmin: false,
        canViewContactEmailAndPhone: true,
      } as const
      await pipelineMemberService.setMember({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        workspaceMemberId: own.memberId,
        scope: token,
        permissions: {
          canView: true,
          canEdit: false,
          canDelete: false,
          canManageSettings: false,
        },
      })

      const copy = await pipelineService.duplicate({
        workspaceId: own.workspaceId,
        id: source.id,
        scope: plain,
        actor,
      })
      const members = await pipelineMemberService.listMembers({
        workspaceId: own.workspaceId,
        pipelineId: copy.id,
        scope: token,
      })

      expect(members).toEqual([
        expect.objectContaining({
          workspaceMemberId: own.memberId,
          canView: true,
          canEdit: true,
          canDelete: true,
          canManageSettings: true,
        }),
      ])
    })

    test("a field added after a delete goes last and the order is stable", async () => {
      const pipeline = await newPipeline(own)
      const add = (referenceName: string) =>
        pipelineStructureService.createField({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
          values: {
            name: referenceName,
            referenceName,
            type: "shortText",
            required: false,
          },
        })
      const a = await add("a_field")
      await add("b_field")
      await add("c_field")
      await pipelineStructureService.deleteField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        fieldId: a.id,
        scope: token,
      })
      await add("d_field")

      const detail = await pipelineService.get({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
      })
      expect(detail.fields.map((field) => field.referenceName)).toEqual([
        "b_field",
        "c_field",
        "d_field",
      ])
      expect(new Set(detail.fields.map((field) => field.position)).size).toBe(3)
      const listed = await pipelineService.listFields({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })
      expect(listed.map((field) => field.id)).toEqual(
        detail.fields.map((field) => field.id),
      )
    })

    test("listFields needs view access and stays inside the workspace", async () => {
      const pipeline = await newPipeline(own)
      const plain = {
        kind: "member",
        workspaceMemberId: own.memberId,
        isWorkspaceAdmin: false,
        canViewContactEmailAndPhone: true,
      } as const

      await expect(
        pipelineService.listFields({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: plain,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })
      await expect(
        pipelineService.listFields({
          workspaceId: other.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })
      expect(
        await pipelineService.listFields({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
        }),
      ).toEqual([])
    })

    test("hides a pipeline from a member without a grant and limits one with view only", async () => {
      const pipeline = await newPipeline(own)
      const plain = {
        kind: "member",
        workspaceMemberId: own.memberId,
        isWorkspaceAdmin: false,
        canViewContactEmailAndPhone: true,
      } as const

      await expect(
        pipelineService.get({
          workspaceId: own.workspaceId,
          id: pipeline.id,
          scope: plain,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      await pipelineMemberService.setMember({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        workspaceMemberId: own.memberId,
        scope: token,
        permissions: {
          canView: true,
          canEdit: false,
          canDelete: false,
          canManageSettings: false,
        },
      })

      await expect(
        pipelineItemService.create({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          contactId: own.contactIds[0],
          fields: { title: "x" },
          scope: plain,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 403 })
      const visible = await pipelineService.list({
        workspaceId: own.workspaceId,
        scope: plain,
      })
      expect(visible).toHaveLength(1)

      const withPermissions = await pipelineService.listWithPermissions({
        workspaceId: own.workspaceId,
        scope: plain,
      })
      expect(withPermissions).toHaveLength(1)
      expect(withPermissions[0]?.permissions).toEqual({
        canView: true,
        canEdit: false,
        canDelete: false,
        canManageSettings: false,
      })
      const asToken = await pipelineService.listWithPermissions({
        workspaceId: own.workspaceId,
        scope: token,
      })
      expect(asToken.every((entry) => entry.permissions.canDelete)).toBe(true)
    })

    test("a foreign workspace's pipeline is not found", async () => {
      const foreign = await newPipeline(other)

      await expect(
        pipelineService.get({
          workspaceId: own.workspaceId,
          id: foreign.id,
          scope: token,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })
    })
  })

  describe("items", () => {
    test("numbers items consecutively per workspace across pipelines", async () => {
      const a = await newPipeline(own, "A")
      const b = await newPipeline(own, "B")

      const first = await newItem(own, a.id)
      const second = await newItem(own, b.id)

      expect([first.number, second.number]).toEqual([1, 2])
    })

    test("rejects every foreign id with 404", async () => {
      const pipeline = await newPipeline(own)
      const foreignPipeline = await newPipeline(other)
      const [foreignStage] = await stagesOf(other, foreignPipeline.id)

      const attempts = [
        () => newItem(own, pipeline.id, { contactId: other.contactIds[0] }),
        () =>
          newItem(own, pipeline.id, {
            fields: { title: "x", stageId: foreignStage.id },
          }),
        () =>
          newItem(own, pipeline.id, {
            fields: { title: "x", assigneeMemberIds: [other.memberId] },
          }),
        () =>
          newItem(own, pipeline.id, {
            fields: { title: "x", assigneeInboxTeamIds: [other.teamId] },
          }),
        () =>
          newItem(own, pipeline.id, {
            mediaLibraryFileIds: [other.mediaFileId],
          }),
      ]

      for (const attempt of attempts) {
        await expect(attempt()).rejects.toMatchObject({ httpStatusCode: 404 })
      }
    })

    test("enforces required custom fields and normalises values", async () => {
      const pipeline = await newPipeline(own)
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: {
          name: "Budget",
          referenceName: "budget",
          type: "number",
          required: true,
        },
      })

      await expect(newItem(own, pipeline.id)).rejects.toMatchObject({
        httpStatusCode: 422,
      })
      await expect(
        newItem(own, pipeline.id, {
          fields: { title: "x", fieldValues: { [field.id]: "abc" } },
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
      const item = await newItem(own, pipeline.id, {
        fields: { title: "ok", fieldValues: { [field.id]: "42" } },
      })

      expect(item.fieldValues[field.id]).toBeDefined()
    })

    test("replaying an idempotency key returns the same item and emits once", async () => {
      const pipeline = await newPipeline(own)

      const first = await newItem(own, pipeline.id, { idempotencyKey: "k-1" })
      const replay = await newItem(own, pipeline.id, { idempotencyKey: "k-1" })

      expect(replay.id).toBe(first.id)
      const created = mocks.emitPipelineItemEvent.mock.calls.filter(
        ([type]) => type === "pipelineItemCreated",
      )
      expect(created).toHaveLength(1)
    })

    test("reusing an idempotency key for another contact is a conflict", async () => {
      const pipeline = await newPipeline(own)
      await newItem(own, pipeline.id, { idempotencyKey: "k-2" })

      await expect(
        newItem(own, pipeline.id, {
          idempotencyKey: "k-2",
          contactId: own.contactIds[1],
        }),
      ).rejects.toMatchObject({ httpStatusCode: 409 })
    })

    test("the per-contact open limit holds under concurrent creates", async () => {
      const pipeline = await newPipeline(own)
      await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
        values: {
          settings: { ...pipeline.settings, maxOpenItemsPerContact: 2 },
        },
      })

      const results = await Promise.allSettled(
        Array.from({ length: 6 }, (_, index) =>
          newItem(own, pipeline.id, { fields: { title: `n${index}` } }),
        ),
      )

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2)
      expect(
        results.filter(
          (r) =>
            r.status === "rejected" &&
            (r.reason as { httpStatusCode: number }).httpStatusCode === 409,
        ),
      ).toHaveLength(4)
    })

    test("a closed item does not count toward the limit and reopening re-checks it", async () => {
      const pipeline = await newPipeline(own)
      await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
        values: {
          settings: { ...pipeline.settings, maxOpenItemsPerContact: 1 },
        },
      })
      const first = await newItem(own, pipeline.id)
      await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: first.id,
        fields: { status: "won" },
        scope: token,
        actor,
      })
      const second = await newItem(own, pipeline.id, {
        fields: { title: "second" },
      })

      await expect(
        pipelineItemService.update({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: first.id,
          fields: { status: "open" },
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 409 })
      expect(second.status).toBe("open")
    })

    test("status changes keep closure bookkeeping and emit only the changed events", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id, {
        fields: { title: "d", value: 100 },
      })
      mocks.emitPipelineItemEvent.mockClear()

      const won = await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: { status: "won" },
        scope: token,
        actor: { kind: "user", userId: own.userId, sourceId: null },
      })
      const reopened = await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: { status: "open" },
        scope: token,
        actor,
      })

      expect(won.closedAt).not.toBeNull()
      expect(won.closedById).toBe(own.userId)
      expect(reopened.closedAt).toBeNull()
      expect(
        mocks.emitPipelineItemEvent.mock.calls.map(([type]) => type),
      ).toEqual(["pipelineItemStatusChanged", "pipelineItemStatusChanged"])
    })

    test("moving to a stage emits a moved event with the previous stage", async () => {
      const pipeline = await newPipeline(own)
      const stage = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Won",
      })
      const item = await newItem(own, pipeline.id)
      mocks.emitPipelineItemEvent.mockClear()

      const moved = await pipelineItemService.move({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        stageId: stage.id,
        scope: token,
        actor,
      })

      expect(moved.stageId).toBe(stage.id)
      expect(mocks.emitPipelineItemEvent).toHaveBeenCalledWith(
        "pipelineItemMovedToStage",
        own.workspaceId,
        own.contactIds[0],
        expect.objectContaining({ fromStageName: "Lead", stageName: "Won" }),
      )
    })

    test("deleting an item writes an audit record after the commit", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      vi.mocked(dispatchAuditRecord).mockClear()

      await pipelineItemService.delete({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        scope: token,
        actor,
      })

      expect(dispatchAuditRecord).toHaveBeenCalledTimes(1)
      expect(dispatchAuditRecord).toHaveBeenCalledWith({
        action: "delete",
        detail: `deleted pipeline ${pipeline.id} item ${item.id}`,
      })
    })

    test("a transfer writes an audit record and a rejected one writes none", async () => {
      const source = await newPipeline(own, "AuditSrc")
      const destination = await newPipeline(own, "AuditDst")
      const item = await newItem(own, source.id)
      vi.mocked(dispatchAuditRecord).mockClear()

      await expect(
        pipelineItemService.transfer({
          workspaceId: own.workspaceId,
          pipelineId: source.id,
          itemId: item.id,
          destinationPipelineId: source.id,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
      expect(dispatchAuditRecord).not.toHaveBeenCalled()

      await pipelineItemService.transfer({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        itemId: item.id,
        destinationPipelineId: destination.id,
        scope: token,
        actor,
      })

      expect(dispatchAuditRecord).toHaveBeenCalledTimes(1)
      expect(dispatchAuditRecord).toHaveBeenCalledWith({
        action: "update",
        detail: `transferred pipeline ${source.id} item ${item.id} to pipeline ${destination.id}`,
      })
    })

    test("a failed mutation emits nothing", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      mocks.emitPipelineItemEvent.mockClear()

      await expect(
        pipelineItemService.update({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          fields: { value: 5, stageId: "999999999" },
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      expect(mocks.emitPipelineItemEvent).not.toHaveBeenCalled()
    })

    test("activity after a transfer names the stages and pipelines on both sides", async () => {
      const source = await newPipeline(own, "Activity src")
      const destination = await newPipeline(own, "Activity dst")
      const [sourceStage] = await pipelineStageRepository.listByPipeline({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
      })
      const [destinationStage] = await pipelineStageRepository.listByPipeline({
        workspaceId: own.workspaceId,
        pipelineId: destination.id,
      })
      const item = await newItem(own, source.id, { fields: { title: "t" } })
      await pipelineItemService.transfer({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        itemId: item.id,
        destinationPipelineId: destination.id,
        scope: token,
        actor,
      })

      const activity = (
        await pipelineItemQueryService.listActivity({
          workspaceId: own.workspaceId,
          pipelineId: destination.id,
          itemId: item.id,
          scope: token,
        })
      ).items

      const transferred = activity.find((row) => row.kind === "transferred")
      expect(transferred).toMatchObject({
        fromPipelineName: "Activity src",
        pipelineName: "Activity dst",
        fromStageName: sourceStage?.name,
        toStageName: destinationStage?.name,
      })
      // Rows recorded before the transfer keep their source names.
      expect(activity.find((row) => row.kind === "created")).toMatchObject({
        pipelineName: "Activity src",
        toStageName: sourceStage?.name,
      })
    })

    test("a member who can view only the destination gets no source names", async () => {
      const source = await newPipeline(own, "Restricted src")
      const destination = await newPipeline(own, "Open dst")
      const [destinationStage] = await pipelineStageRepository.listByPipeline({
        workspaceId: own.workspaceId,
        pipelineId: destination.id,
      })
      const item = await newItem(own, source.id, { fields: { title: "t" } })
      await pipelineItemService.transfer({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        itemId: item.id,
        destinationPipelineId: destination.id,
        scope: token,
        actor,
      })
      await pipelineMemberService.setMember({
        workspaceId: own.workspaceId,
        pipelineId: destination.id,
        workspaceMemberId: own.memberId,
        scope: token,
        permissions: {
          canView: true,
          canEdit: false,
          canDelete: false,
          canManageSettings: false,
        },
      })

      const activity = (
        await pipelineItemQueryService.listActivity({
          workspaceId: own.workspaceId,
          pipelineId: destination.id,
          itemId: item.id,
          scope: {
            kind: "member",
            workspaceMemberId: own.memberId,
            isWorkspaceAdmin: false,
            canViewContactEmailAndPhone: true,
          },
        })
      ).items

      expect(activity.find((row) => row.kind === "transferred")).toMatchObject({
        fromPipelineName: null,
        fromStageName: null,
        pipelineName: "Open dst",
        toStageName: destinationStage?.name,
      })
      expect(activity.find((row) => row.kind === "created")).toMatchObject({
        pipelineName: null,
        toStageName: null,
      })
    })

    test("activity filters by group and still requires view access", async () => {
      const source = await newPipeline(own, "Filter src")
      const destination = await newPipeline(own, "Filter dst")
      const item = await newItem(own, source.id, { fields: { title: "t" } })
      await pipelineItemService.transfer({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        itemId: item.id,
        destinationPipelineId: destination.id,
        scope: token,
        actor,
      })
      const list = (
        groups: Parameters<
          typeof pipelineItemQueryService.listActivity
        >[0]["groups"],
        scope: Parameters<
          typeof pipelineItemQueryService.listActivity
        >[0]["scope"] = token,
      ) =>
        pipelineItemQueryService.listActivity({
          workspaceId: own.workspaceId,
          pipelineId: destination.id,
          itemId: item.id,
          groups,
          scope,
        })

      const lifecycle = await list(["lifecycle"])
      const comments = await list(["comments"])

      expect(lifecycle.items.map(({ kind }) => kind).sort()).toEqual([
        "created",
        "transferred",
      ])
      expect(comments.items).toEqual([])
      // A member with no grant on the pipeline cannot read it, filter or not.
      await expect(
        list(["lifecycle"], {
          kind: "member",
          workspaceMemberId: own.memberId,
          isWorkspaceAdmin: false,
          canViewContactEmailAndPhone: true,
        }),
      ).rejects.toThrow("Pipeline not found")
    })

    test("transfer keeps number and created time, remaps fields and leaves missing required ones empty", async () => {
      const source = await newPipeline(own, "Src")
      const destination = await newPipeline(own, "Dst")
      const sourceField = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        scope: token,
        values: {
          name: "Plan",
          referenceName: "plan",
          type: "shortText",
          required: false,
        },
      })
      const destinationField = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: destination.id,
        scope: token,
        values: {
          name: "Plan",
          referenceName: "plan",
          type: "shortText",
          required: false,
        },
      })
      const item = await newItem(own, source.id, {
        fields: { title: "t", fieldValues: { [sourceField.id]: "gold" } },
      })

      const moved = await pipelineItemService.transfer({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        itemId: item.id,
        destinationPipelineId: destination.id,
        scope: token,
        actor,
      })

      expect(moved.number).toBe(item.number)
      expect(moved.createdAt.getTime()).toBe(item.createdAt.getTime())
      expect(moved.pipelineId).toBe(destination.id)
      expect(moved.fieldValues).toEqual({ [destinationField.id]: "gold" })
      await expect(
        pipelineItemQueryService.getItem({
          workspaceId: own.workspaceId,
          pipelineId: source.id,
          itemId: item.id,
          scope: token,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        scope: token,
        values: {
          name: "Need",
          referenceName: "need",
          type: "shortText",
          required: false,
        },
      })
      await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: destination.id,
        scope: token,
        values: {
          name: "Req",
          referenceName: "req",
          type: "shortText",
          required: true,
        },
      })
      const second = await newItem(own, source.id, { fields: { title: "s" } })
      // Like items that existed before a required field was added: the move
      // is not blocked, the field just starts empty.
      const movedSecond = await pipelineItemService.transfer({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        itemId: second.id,
        destinationPipelineId: destination.id,
        scope: token,
        actor,
      })
      expect(movedSecond.pipelineId).toBe(destination.id)
      expect(movedSecond.fieldValues).toEqual({})
      // An unrelated edit afterwards is not blocked by the empty field either.
      await expect(
        pipelineItemService.update({
          workspaceId: own.workspaceId,
          pipelineId: destination.id,
          itemId: second.id,
          fields: { title: "renamed" },
          scope: token,
          actor,
        }),
      ).resolves.toMatchObject({ title: "renamed" })
    })

    test("comments page newest first by cursor, without gaps or repeats, and reject a bad cursor", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      // Same timestamp for a run of rows, so the id tie-breaker is exercised.
      await db.execute(sql`
        INSERT INTO "PipelineItemComment" ("id","workspaceId","itemId","text","createdAt","updatedAt")
        SELECT (2000000000000 + g)::bigint, ${own.workspaceId}::bigint, ${item.id}::bigint,
               'c' || g, now() - ((g / 10) || ' minutes')::interval, now()
        FROM generate_series(1, 150) g
      `)
      const page = (cursor?: string) =>
        pipelineItemQueryService.listComments({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          cursor,
          scope: token,
        })

      const first = await page()
      expect(first.items).toHaveLength(100)
      expect(first.nextCursor).not.toBeNull()
      const second = await page(first.nextCursor ?? undefined)
      expect(second.items).toHaveLength(50)
      expect(second.nextCursor).toBeNull()

      const all = [...first.items, ...second.items]
      expect(new Set(all.map((comment) => comment.id)).size).toBe(150)
      const isNewestFirst = all.every(
        (comment, index) =>
          index === 0 ||
          all[index - 1].createdAt.getTime() > comment.createdAt.getTime() ||
          (all[index - 1].createdAt.getTime() === comment.createdAt.getTime() &&
            BigInt(all[index - 1].id) > BigInt(comment.id)),
      )
      expect(isNewestFirst).toBe(true)

      await expect(page("not-a-cursor")).rejects.toMatchObject({
        httpStatusCode: 422,
      })
    })

    test("comments are idempotent and deleting the last one clears lastCommentAt", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      const comment = await pipelineItemContentService.addComment({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        text: "hello",
        idempotencyKey: "c-1",
        scope: token,
        actor,
      })
      const replay = await pipelineItemContentService.addComment({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        text: "hello",
        idempotencyKey: "c-1",
        scope: token,
        actor,
      })
      expect(replay.id).toBe(comment.id)

      await pipelineItemContentService.deleteComment({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        commentId: comment.id,
        scope: token,
        actor,
      })

      const detail = await pipelineItemQueryService.getItem({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        scope: token,
      })
      expect(detail.item.lastCommentAt).toBeNull()
      expect(detail.commentCount).toBe(0)
    })

    test("assigning the contact follows the earliest assignee and never unassigns", async () => {
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
      mocks.assignByContactIds.mockClear()

      await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: { assigneeMemberIds: [own.memberId] },
        scope: token,
        actor,
      })
      expect(mocks.assignByContactIds).toHaveBeenCalledWith(
        expect.objectContaining({ assignedId: `u_${own.userId}` }),
      )

      mocks.assignByContactIds.mockClear()
      await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: { assigneeMemberIds: [] },
        scope: token,
        actor,
      })
      expect(mocks.assignByContactIds).not.toHaveBeenCalled()
    })

    test("a late assignment effect follows the item's current primary", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id, {
        fields: { title: "t", assigneeMemberIds: [own.memberId] },
      })
      mocks.assignByContactIds.mockClear()

      // A late effect from an older update (none → team 999): the item is now
      // on the member, so that is the target, from either side of the old move.
      await dispatchPipelineEffects([
        {
          kind: "assignContact",
          workspaceId: own.workspaceId,
          contactId: item.contactId,
          pipelineId: pipeline.id,
          itemId: item.id,
          assignedId: "t_999",
          previousAssignedId: null,
        },
      ])

      expect(mocks.assignByContactIds).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedId: `u_${own.userId}`,
          onlyFromAssignees: [null, null, "t_999"],
        }),
      )
    })

    test("an assignment effect for an item with no primary any more does nothing", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id, { fields: { title: "t" } })
      mocks.assignByContactIds.mockClear()

      await dispatchPipelineEffects([
        {
          kind: "assignContact",
          workspaceId: own.workspaceId,
          contactId: item.contactId,
          pipelineId: pipeline.id,
          itemId: item.id,
          assignedId: `u_${own.userId}`,
          previousAssignedId: null,
        },
      ])

      expect(mocks.assignByContactIds).not.toHaveBeenCalled()
    })

    test("the board returns per-stage items, totals and contact summaries", async () => {
      const pipeline = await newPipeline(own)
      await newItem(own, pipeline.id, { fields: { title: "a", value: 10 } })
      await newItem(own, pipeline.id, { fields: { title: "b", value: 15 } })

      const board = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })

      expect(board.stages[0]).toMatchObject({ count: 2, totalValue: 25 })
      expect(board.stages[0].items).toHaveLength(2)
      expect(board.stages[0].items[0].contact?.id).toBe(own.contactIds[0])
    })

    test("a card's contact carries its connection channel, null without one", async () => {
      const pipeline = await newPipeline(own)
      const [inbox] = await db
        .insert(inboxModel)
        .values({
          workspaceId: own.workspaceId,
          name: "Telegram",
          channel: "telegram",
          sourceId: `pipeline-${own.workspaceId}`,
        })
        .returning({ id: inboxModel.id })
      const connected = own.contactIds[1]
      await db.insert(contactInboxModel).values({
        contactId: connected,
        originalContactId: connected,
        inboxId: inbox.id,
        channel: "telegram",
        source: "telegram",
        sourceId: `pipeline-${connected}`,
      })
      await newItem(own, pipeline.id)
      await newItem(own, pipeline.id, { contactId: connected })

      const board = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })

      const channelByContact = new Map(
        board.stages[0].items.map((view) => [
          view.contact?.id,
          view.contact?.channel,
        ]),
      )
      expect(channelByContact.get(connected)).toBe("telegram")
      expect(channelByContact.get(own.contactIds[0])).toBeNull()
    })
  })

  describe("stage removal", () => {
    test("refuses to delete the last stage", async () => {
      const pipeline = await newPipeline(own)
      const [only] = await stagesOf(own, pipeline.id)

      await expect(
        pipelineStageBulkService.deleteStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          stageId: only.id,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
    })

    test("a settings-only member cannot remove their own grant", async () => {
      const pipeline = await newPipeline(own)
      await pipelineMemberService.setMember({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        workspaceMemberId: own.memberId,
        scope: token,
        permissions: {
          canView: true,
          canEdit: false,
          canDelete: false,
          canManageSettings: true,
        },
      })

      await expect(
        pipelineMemberService.removeMember({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          workspaceMemberId: own.memberId,
          scope: {
            kind: "member",
            workspaceMemberId: own.memberId,
            isWorkspaceAdmin: false,
            canViewContactEmailAndPhone: true,
          },
        }),
      ).rejects.toMatchObject({ httpStatusCode: 403 })
    })

    test("a settings-only member removes empty stages but not stages holding items", async () => {
      const pipeline = await newPipeline(own)
      const settingsOnly = {
        kind: "member",
        workspaceMemberId: own.memberId,
        isWorkspaceAdmin: false,
        canViewContactEmailAndPhone: true,
      } as const
      await pipelineMemberService.setMember({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        workspaceMemberId: own.memberId,
        scope: token,
        permissions: {
          canView: true,
          canEdit: false,
          canDelete: false,
          canManageSettings: true,
        },
      })
      const empty = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Empty",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await newItem(own, pipeline.id, {
        fields: { title: "t", stageId: first.id },
      })

      // Deleting the items needs delete; moving them needs edit.
      await expect(
        pipelineStageBulkService.deleteStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          stageId: first.id,
          scope: settingsOnly,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 403 })
      await expect(
        pipelineStageBulkService.deleteStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          stageId: first.id,
          moveItemsToStageId: empty.id,
          scope: settingsOnly,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 403 })
      await expect(
        pipelineStageBulkService.deleteStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          stageId: empty.id,
          scope: settingsOnly,
          actor,
        }),
      ).resolves.toMatchObject({ queued: false })
    })

    test("moves items to another stage before deleting, or deletes them", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await newItem(own, pipeline.id)
      await newItem(own, pipeline.id, { fields: { title: "two" } })

      const result = await pipelineStageBulkService.deleteStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        moveItemsToStageId: second.id,
        scope: token,
        actor,
      })

      expect(result).toEqual({ queued: false })
      const stages = await stagesOf(own, pipeline.id)
      expect(stages.map((stage) => [stage.name, stage.position])).toEqual([
        ["Second", 0],
      ])
      const board = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })
      expect(board.stages[0].count).toBe(2)

      const third = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Third",
      })
      await pipelineStageBulkService.deleteStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: second.id,
        scope: token,
        actor,
      })
      const afterDelete = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })
      expect(afterDelete.stages.map((s) => s.stage.id)).toEqual([third.id])
      expect(afterDelete.stages[0].count).toBe(0)
    })

    test("a stage above the inline limit is queued, blocks new items, and the job drains it", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await db.execute(sql`
        INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","updatedAt")
        SELECT (1000000000000 + g)::bigint, ${own.workspaceId}::bigint, ${pipeline.id}::bigint, ${first.id}::bigint, ${own.contactIds[0]}::bigint, g, 'bulk ' || g, 'lost', 'low', '{}'::jsonb, now(), now()
        FROM generate_series(1, 2001) AS g`)

      const result = await pipelineStageBulkService.deleteStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        moveItemsToStageId: second.id,
        scope: token,
        actor,
      })

      expect(result).toMatchObject({ queued: true })
      expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
      await expect(
        newItem(own, pipeline.id, {
          fields: { title: "x", stageId: first.id },
        }),
      ).rejects.toMatchObject({ httpStatusCode: 409 })

      await pipelineStageBulkService.processQueued({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        bulkJobId: (result as { jobId: string }).jobId,
        moveItemsToStageId: second.id,
        actorUserId: null,
        actorKind: "user",
        actorSourceId: null,
      })
      // A retried job after completion is a harmless no-op.
      await pipelineStageBulkService.processQueued({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        bulkJobId: (result as { jobId: string }).jobId,
        moveItemsToStageId: second.id,
        actorUserId: null,
        actorKind: "user",
        actorSourceId: null,
      })

      const board = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })
      expect(board.stages.map((s) => s.stage.id)).toEqual([second.id])
      expect(board.stages[0].count).toBe(2001)
    })

    test("a queued removal still runs when the user who queued it was deleted", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await db.execute(sql`
        INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","updatedAt")
        SELECT (5000000000000 + g)::bigint, ${own.workspaceId}::bigint, ${pipeline.id}::bigint, ${first.id}::bigint, ${own.contactIds[0]}::bigint, 700000 + g, 'bulk ' || g, 'open', 'low', '{}'::jsonb, now(), now()
        FROM generate_series(1, 2001) AS g`)
      const result = await pipelineStageBulkService.deleteStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        moveItemsToStageId: second.id,
        scope: token,
        actor,
      })

      // An id no User row has: the account was deleted after queueing.
      await pipelineStageBulkService.processQueued({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        bulkJobId: (result as { jobId: string }).jobId,
        moveItemsToStageId: second.id,
        actorUserId: "999999999999999998",
        actorKind: "user",
        actorSourceId: null,
      })

      const board = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })
      expect(board.stages.map((entry) => entry.stage.id)).toEqual([second.id])
      const [moved] = await db
        .execute<{ actorUserId: string | null }>(sql`
        SELECT "actorUserId" FROM "PipelineItemActivity"
        WHERE "workspaceId" = ${own.workspaceId}::bigint
          AND "pipelineId" = ${pipeline.id}::bigint
          AND "kind" = 'stageChanged'
        LIMIT 1`)
        .then((rows) => rows.rows)
      expect(moved?.actorUserId).toBeNull()
    })

    test("a queued removal keeps the workspace-token actor on every batch", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await db.execute(sql`
        INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","updatedAt")
        SELECT (3000000000000 + g)::bigint, ${own.workspaceId}::bigint, ${pipeline.id}::bigint, ${first.id}::bigint, ${own.contactIds[0]}::bigint, 500000 + g, 'bulk ' || g, 'open', 'low', '{}'::jsonb, now(), now()
        FROM generate_series(1, 2001) AS g`)
      const tokenActor = {
        kind: "workspaceToken",
        userId: null,
        sourceId: "token-42",
      } as const
      mocks.queueAdd.mockClear()

      const result = await pipelineStageBulkService.deleteStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        moveItemsToStageId: second.id,
        scope: token,
        actor: tokenActor,
      })
      const job = mocks.queueAdd.mock.calls[0]?.[1] as {
        data: Parameters<typeof pipelineStageBulkService.processQueued>[0]
      }
      expect(job.data).toMatchObject({
        actorKind: "workspaceToken",
        actorSourceId: "token-42",
      })

      await pipelineStageBulkService.processQueued(job.data)

      const kinds = await db.execute<{
        actorKind: string
        actorSourceId: string | null
      }>(sql`
        SELECT DISTINCT "actorKind", "actorSourceId" FROM "PipelineItemActivity"
        WHERE "pipelineId" = ${pipeline.id}::bigint AND "kind" = 'stageChanged'`)
      expect(result).toMatchObject({ queued: true })
      expect(kinds.rows).toEqual([
        { actorKind: "workspaceToken", actorSourceId: "token-42" },
      ])
    })
  })

  describe("updatedAt reflects real changes", () => {
    const readItem = async (itemId: string) =>
      await pipelineItemQueryService.getItem({
        workspaceId: own.workspaceId,
        pipelineId: pipelineIdOf.current,
        itemId,
        scope: token,
      })
    const pipelineIdOf = { current: "" }

    test("adding an attachment bumps updatedAt", async () => {
      const pipeline = await newPipeline(own)
      pipelineIdOf.current = pipeline.id
      const item = await newItem(own, pipeline.id)
      const before = (await readItem(item.id)).item.updatedAt
      // updatedAt has millisecond precision: make sure the clock moved on.
      await new Promise((resolve) => setTimeout(resolve, 5))

      await pipelineItemContentService.addAttachments({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        mediaLibraryFileIds: [own.mediaFileId],
        scope: token,
        actor,
      })

      const after = (await readItem(item.id)).item.updatedAt
      expect(after.getTime()).toBeGreaterThan(before.getTime())
    })

    test("re-adding an attached file changes neither updatedAt nor activity", async () => {
      const pipeline = await newPipeline(own)
      pipelineIdOf.current = pipeline.id
      const item = await newItem(own, pipeline.id)
      const add = async () =>
        await pipelineItemContentService.addAttachments({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          mediaLibraryFileIds: [own.mediaFileId],
          scope: token,
          actor,
        })
      await add()
      const after = (await readItem(item.id)).item.updatedAt
      const activityBefore = (
        await pipelineItemQueryService.listActivity({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          scope: token,
        })
      ).items

      await add()

      expect((await readItem(item.id)).item.updatedAt.getTime()).toBe(
        after.getTime(),
      )
      const activityAfter = (
        await pipelineItemQueryService.listActivity({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          scope: token,
        })
      ).items
      expect(activityAfter).toHaveLength(activityBefore.length)
    })

    test("an update that changes nothing leaves updatedAt alone", async () => {
      const pipeline = await newPipeline(own)
      pipelineIdOf.current = pipeline.id
      const item = await newItem(own, pipeline.id, {
        fields: { title: "same" },
      })
      const before = (await readItem(item.id)).item.updatedAt

      const returned = await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: { title: "same", priority: item.priority },
        scope: token,
        actor,
      })

      expect(returned.updatedAt.getTime()).toBe(before.getTime())
      expect((await readItem(item.id)).item.updatedAt.getTime()).toBe(
        before.getTime(),
      )
    })
  })

  describe("date custom fields", () => {
    test("a date written in a browser zone is found by that local day", async () => {
      const pipeline = await newPipeline(own)
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: {
          name: "Renewal",
          referenceName: "renewal",
          type: "date",
          required: false,
        },
      })
      const item = await newItem(own, pipeline.id, {
        fields: {
          title: "dated",
          fieldValues: { [field.id]: "2026-05-20" },
          fieldValuesTimezone: "Asia/Ho_Chi_Minh",
        },
      })
      await newItem(own, pipeline.id, {
        fields: {
          title: "other day",
          fieldValues: { [field.id]: "2026-05-21" },
          fieldValuesTimezone: "Asia/Ho_Chi_Minh",
        },
      })
      expect(item.fieldValues[field.id]).toBe("2026-05-20T00:00:00+07:00")

      const page = await pipelineItemQueryService.listItems({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        filter: {
          fieldConditions: {
            [field.id]: { operator: "is", value: "2026-05-20" },
          },
          timezone: "Asia/Ho_Chi_Minh",
        },
        sort: { key: "createdAt", direction: "desc" },
        limit: 10,
      })

      expect(page.items.map((view) => view.item.title)).toEqual(["dated"])

      await db.execute(
        sql`UPDATE "PipelineItem" SET "fieldValues" = jsonb_build_object(${field.id}::text, '2026-02-30T00:00:00+07:00') WHERE "id" = ${item.id}::bigint`,
      )
      const afterCorruption = await pipelineItemQueryService.listItems({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        filter: {
          fieldConditions: {
            [field.id]: { operator: "gt", value: "2026-01-01" },
          },
        },
        sort: { key: "createdAt", direction: "desc" },
        limit: 10,
      })
      expect(afterCorruption.items.map((view) => view.item.title)).toEqual([
        "other day",
      ])
    })
  })

  describe("date range filter safety", () => {
    test("hostile text values never break a date filter and non-date fields are rejected", async () => {
      const pipeline = await newPipeline(own)
      const dateField = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: {
          name: "When",
          referenceName: "when_at",
          type: "date",
          required: false,
        },
      })
      const textField = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: {
          name: "Note",
          referenceName: "note_text",
          type: "shortText",
          required: false,
        },
      })
      for (const [i, hostile] of [
        "0000-01-01T00:00:00Z",
        "2024-01-01T00:00:00+16:00",
        "0000-02-29T00:00:00Z",
      ].entries()) {
        const item = await newItem(own, pipeline.id, {
          fields: {
            title: `hostile ${i}`,
            fieldValues: { [textField.id]: hostile },
          },
        })
        // Stored as-is under the date field, as a corrupted or foreign write could leave it.
        await db.execute(
          sql`UPDATE "PipelineItem" SET "fieldValues" = jsonb_build_object(${dateField.id}::text, ${hostile}::text) WHERE "id" = ${item.id}::bigint`,
        )
      }
      const run = async (fieldId: string) =>
        await pipelineItemQueryService.listItems({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
          filter: {
            fieldConditions: {
              [fieldId]: { operator: "gt", value: "2000-01-01" },
            },
          },
          sort: { key: "createdAt", direction: "desc" },
          limit: 10,
        })

      await expect(run(dateField.id)).resolves.toMatchObject({ items: [] })
      // `gt` is an ordering operator: a text field does not offer it.
      await expect(run(textField.id)).rejects.toMatchObject({
        httpStatusCode: 422,
      })
    })

    test("a field filter the pipeline cannot run is a 422 naming the problem", async () => {
      const pipeline = await newPipeline(own)
      const create = (name: string, type: "number" | "date" | "boolean") =>
        pipelineStructureService.createField({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
          values: { name, referenceName: name, type, required: false },
        })
      const number = await create("amount_n", "number")
      const date = await create("due_d", "date")
      const flag = await create("vip_b", "boolean")
      const list = async (
        fieldId: string,
        condition: { operator: string; value?: string; valueTo?: string },
        timezone?: string,
      ) =>
        await pipelineItemQueryService.listItems({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
          filter: {
            fieldConditions: {
              [fieldId]: condition as {
                operator: "is"
                value?: string
                valueTo?: string
              },
            },
            timezone,
          },
          sort: { key: "createdAt", direction: "desc" },
          limit: 10,
        })
      const rejected = (message: string) => ({
        httpStatusCode: 422,
        message: expect.stringContaining(message),
      })

      await expect(
        list(flag.id, { operator: "gt", value: "1" }),
      ).rejects.toMatchObject(rejected("not available for boolean"))
      await expect(
        list(number.id, { operator: "contains", value: "1" }),
      ).rejects.toMatchObject(rejected("not available for number"))
      await expect(
        list("999999999", { operator: "hasValue" }),
      ).rejects.toMatchObject(rejected("not a custom field of this pipeline"))
      await expect(list(number.id, { operator: "gt" })).rejects.toMatchObject(
        rejected("needs value"),
      )
      await expect(
        list(number.id, { operator: "gt", value: "abc" }),
      ).rejects.toMatchObject(rejected("as a number"))
      await expect(
        list(date.id, { operator: "is", value: "2026-02-30" }),
      ).rejects.toMatchObject(rejected("YYYY-MM-DD"))
      await expect(
        list(date.id, { operator: "between" }),
      ).rejects.toMatchObject(rejected("value, valueTo or both"))
      await expect(
        list(flag.id, { operator: "is", value: "yes" }),
      ).rejects.toMatchObject(rejected('"true" or "false"'))

      await expect(
        list(date.id, { operator: "between", valueTo: "2026-05-20" }),
      ).resolves.toMatchObject({ items: [] })
      await expect(
        list(flag.id, { operator: "noValue" }),
      ).resolves.toMatchObject({
        items: [],
      })
    })

    test("a date filter without a timezone uses the workspace timezone", async () => {
      const pipeline = await newPipeline(own)
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: {
          name: "Due",
          referenceName: "due_default_tz",
          type: "datetime",
          required: false,
        },
      })
      const item = await newItem(own, pipeline.id, {
        fields: { title: "late evening" },
      })
      // 2026-05-20 23:30 in Ho Chi Minh is still the 20th, but the 20th at 16:30 in UTC.
      await db.execute(
        sql`UPDATE "PipelineItem" SET "fieldValues" = jsonb_build_object(${field.id}::text, '2026-05-20T23:30:00+07:00') WHERE "id" = ${item.id}::bigint`,
      )
      const titlesOn = async (timezone?: string) =>
        (
          await pipelineItemQueryService.listItems({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            scope: token,
            filter: {
              fieldConditions: {
                [field.id]: { operator: "is", value: "2026-05-20" },
              },
              timezone,
            },
            sort: { key: "createdAt", direction: "desc" },
            limit: 10,
          })
        ).items.map((view) => view.item.title)

      expect(await titlesOn("Asia/Ho_Chi_Minh")).toEqual(["late evening"])
      expect(await titlesOn("Pacific/Kiritimati")).toEqual([])
      // No timezone: the workspace's own zone decides, whatever it is.
      const [workspace] = await db
        .select({ timezone: workspaceModel.timezone })
        .from(workspaceModel)
        .where(eq(workspaceModel.id, own.workspaceId))
      expect(await titlesOn()).toEqual(await titlesOn(workspace.timezone))
    })
  })

  describe("review regressions", () => {
    const seedBulkItems = async (
      fixture: Fixture,
      pipelineId: string,
      stageId: string,
    ) => {
      await db.execute(sql`
        INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","updatedAt")
        SELECT (2000000000000 + g)::bigint, ${fixture.workspaceId}::bigint, ${pipelineId}::bigint, ${stageId}::bigint, ${fixture.contactIds[0]}::bigint, g, 'bulk ' || g, 'lost', 'low', '{}'::jsonb, now(), now()
        FROM generate_series(1, 2001) AS g`)
    }

    test("a replayed create returns the first item even when the open limit is 1", async () => {
      const pipeline = await newPipeline(own)
      await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
        values: { settings: { maxOpenItemsPerContact: 1 } },
      })
      const first = await newItem(own, pipeline.id, {
        idempotencyKey: "retry-1",
      })

      const replay = await newItem(own, pipeline.id, {
        idempotencyKey: "retry-1",
      })

      expect(replay.id).toBe(first.id)
    })

    test("a required field added later does not block unrelated updates of older items", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: {
          name: "Need",
          referenceName: "need",
          type: "shortText",
          required: true,
        },
      })

      const updated = await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: { priority: "high" },
        scope: token,
        actor,
      })

      expect(updated.priority).toBe("high")
    })

    test("updating through the wrong pipeline is a 404, as after a concurrent transfer", async () => {
      const source = await newPipeline(own, "A")
      const other2 = await newPipeline(own, "B")
      const item = await newItem(own, source.id)

      await expect(
        pipelineItemService.update({
          workspaceId: own.workspaceId,
          pipelineId: other2.id,
          itemId: item.id,
          fields: { priority: "low" },
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })
    })

    test("a transfer drops the idempotency key so the destination cannot collide", async () => {
      const source = await newPipeline(own, "A")
      const destination = await newPipeline(own, "B")
      await newItem(own, destination.id, { idempotencyKey: "same" })
      const item = await newItem(own, source.id, { idempotencyKey: "same" })

      const moved = await pipelineItemService.transfer({
        workspaceId: own.workspaceId,
        pipelineId: source.id,
        itemId: item.id,
        destinationPipelineId: destination.id,
        scope: token,
        actor,
      })

      expect(moved.idempotencyKey).toBeNull()
    })

    test("only item writes that change counts drop the counts cache; pipeline rows stay cached", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      const countOf = async () => {
        const list = await pipelineService.list({
          workspaceId: own.workspaceId,
          scope: token,
        })
        return list.find((entry) => entry.pipeline.id === pipeline.id)
          ?.itemsCount
      }
      expect(await countOf()).toBe(1)
      vi.mocked(invalidateCacheByTags).mockClear()

      await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: { priority: "high" },
        scope: token,
        actor,
      })
      // An edit changes no count, so neither cache is dropped.
      expect(invalidateCacheByTags).not.toHaveBeenCalled()

      await newItem(own, pipeline.id, { fields: { title: "second" } })
      // A create drops only the counts; the cached pipeline rows stay.
      expect(invalidateCacheByTags).toHaveBeenCalledTimes(1)
      expect(invalidateCacheByTags).toHaveBeenCalledWith([
        `pipelines:${own.workspaceId}:counts`,
      ])
      expect(await countOf()).toBe(2)
    })

    test("a settings change tells open boards of that pipeline to refetch", async () => {
      const pipeline = await newPipeline(own)
      mocks.queueWorkspaceRealtimeEvent.mockClear()

      await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        values: { currency: "VND" },
        scope: token,
      })

      expect(mocks.queueWorkspaceRealtimeEvent).toHaveBeenCalledWith(
        own.workspaceId,
        expect.objectContaining({
          data: { pipelineId: pipeline.id, change: "updated" },
        }),
      )
    })

    test("renaming a pipeline invalidates the cached pipeline list", async () => {
      const pipeline = await newPipeline(own)
      vi.mocked(invalidateCacheByTags).mockClear()

      await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        values: { name: "Renamed pipeline" },
        scope: token,
      })

      expect(invalidateCacheByTags).toHaveBeenCalled()
    })

    test("a plain member with settings rights cannot raise rights or change their own", async () => {
      const pipeline = await newPipeline(own)
      const plain = {
        kind: "member",
        workspaceMemberId: own.memberId,
        isWorkspaceAdmin: false,
        canViewContactEmailAndPhone: true,
      } as const
      await pipelineMemberService.setMember({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        workspaceMemberId: own.memberId,
        scope: token,
        permissions: {
          canView: true,
          canEdit: false,
          canDelete: false,
          canManageSettings: true,
        },
      })
      const [second] = await db
        .insert(workspaceMemberModel)
        .values({
          workspaceId: own.workspaceId,
          userId: own.userId,
          role: "agent",
        })
        .returning({ id: workspaceMemberModel.id })

      await expect(
        pipelineMemberService.setMember({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          workspaceMemberId: second.id,
          scope: plain,
          permissions: {
            canView: true,
            canEdit: false,
            canDelete: true,
            canManageSettings: false,
          },
        }),
      ).rejects.toMatchObject({ httpStatusCode: 403 })
      await expect(
        pipelineMemberService.setMember({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          workspaceMemberId: own.memberId,
          scope: plain,
          permissions: {
            canView: true,
            canEdit: false,
            canDelete: false,
            canManageSettings: true,
          },
        }),
      ).rejects.toMatchObject({ httpStatusCode: 403 })
      await expect(
        pipelineMemberService.setMember({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          workspaceMemberId: second.id,
          scope: plain,
          permissions: {
            canView: true,
            canEdit: false,
            canDelete: false,
            canManageSettings: false,
          },
        }),
      ).resolves.toMatchObject({ canView: true })
    })

    test("an item created already won counts as won with its value", async () => {
      const pipeline = await newPipeline(own)
      await newItem(own, pipeline.id, {
        fields: { title: "closed", value: 250, status: "won" },
      })
      const today = new Date().toISOString().slice(0, 10)

      const stats = await pipelineAnalyticsService.getStats({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        from: today,
        to: today,
        timezone: "UTC",
        scope: token,
      })

      expect(stats.current).toMatchObject({ created: 1, won: 1, wonValue: 250 })
    })

    test("a deleted user's changes stay a user row, apart from automation", async () => {
      const pipeline = await newPipeline(own)
      const flowActor = { kind: "flow", userId: null, sourceId: "f-1" } as const
      // `actor` is a user whose account no longer exists (userId null).
      await newItem(own, pipeline.id)
      await newItem(own, pipeline.id, { actor: flowActor })
      const today = new Date().toISOString().slice(0, 10)

      const stats = await pipelineAnalyticsService.getStats({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        from: today,
        to: today,
        timezone: "UTC",
        scope: token,
      })

      expect(
        stats.byActor
          .map(({ actorKind, actorUserId, created }) => ({
            actorKind,
            actorUserId,
            created,
          }))
          .sort((a, b) => a.actorKind.localeCompare(b.actorKind)),
      ).toEqual([
        { actorKind: "automation", actorUserId: null, created: 1 },
        { actorKind: "user", actorUserId: null, created: 1 },
      ])
    })

    test("an enqueue failure gives the stage back instead of leaving it busy", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await seedBulkItems(own, pipeline.id, first.id)
      mocks.queueAdd.mockRejectedValueOnce(new Error("redis down"))

      await expect(
        pipelineStageBulkService.deleteStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          stageId: first.id,
          moveItemsToStageId: second.id,
          scope: token,
          actor,
        }),
      ).rejects.toThrow("redis down")

      const stages = await stagesOf(own, pipeline.id)
      expect(
        stages.find((stage) => stage.id === first.id)?.bulkJobId,
      ).toBeNull()
    })

    test("another stage cannot be deleted while a job is draining one", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const third = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Third",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await seedBulkItems(own, pipeline.id, first.id)
      await pipelineStageBulkService.deleteStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        moveItemsToStageId: second.id,
        scope: token,
        actor,
      })

      await expect(
        pipelineStageBulkService.deleteStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          stageId: third.id,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 409 })
    })

    test("a queued move aborts and keeps the items when its destination vanished", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await seedBulkItems(own, pipeline.id, first.id)
      const queued = await pipelineStageBulkService.deleteStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        moveItemsToStageId: second.id,
        scope: token,
        actor,
      })
      await db.execute(
        sql`DELETE FROM "PipelineStage" WHERE "id" = ${second.id}::bigint`,
      )

      await pipelineStageBulkService.processQueued({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        bulkJobId: (queued as { jobId: string }).jobId,
        moveItemsToStageId: second.id,
        actorUserId: null,
        actorKind: "user",
        actorSourceId: null,
      })

      const board = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })
      expect(board.stages).toHaveLength(1)
      expect(board.stages[0].count).toBe(2001)
      expect(board.stages[0].stage.bulkJobId).toBeNull()
    })

    test("moving an item within its own stage never deadlocks with deleting that stage", async () => {
      for (let round = 0; round < 3; round += 1) {
        const pipeline = await newPipeline(own, `Race ${round}`)
        const second = await pipelineStructureService.createStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
          name: "Second",
        })
        const [first] = await stagesOf(own, pipeline.id)
        const item = await newItem(own, pipeline.id)

        const results = await Promise.allSettled([
          pipelineItemService.move({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            itemId: item.id,
            stageId: first.id,
            scope: token,
            actor,
          }),
          pipelineStageBulkService.deleteStage({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            stageId: first.id,
            moveItemsToStageId: second.id,
            scope: token,
            actor,
          }),
        ])

        for (const result of results) {
          if (result.status === "rejected") {
            expect(String(result.reason)).not.toContain("deadlock")
          }
        }
      }
    })

    test("items cannot be moved or transferred out of a stage a bulk job owns", async () => {
      const pipeline = await newPipeline(own)
      const destination = await newPipeline(own, "Other")
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      const item = await newItem(own, pipeline.id)
      await db.execute(
        sql`UPDATE "PipelineStage" SET "bulkJobId" = 'job-1' WHERE "id" = ${first.id}::bigint`,
      )

      await expect(
        pipelineItemService.move({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          stageId: second.id,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 409 })
      await expect(
        pipelineItemService.transfer({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          destinationPipelineId: destination.id,
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 409 })
    })

    test("deleting a pipeline drains more than one batch of items and activity", async () => {
      const pipeline = await newPipeline(own)
      const [first] = await stagesOf(own, pipeline.id)
      await seedBulkItems(own, pipeline.id, first.id)
      await db.execute(sql`
        INSERT INTO "PipelineItemActivity" ("id","workspaceId","pipelineId","itemId","itemNumber","itemTitle","contactId","kind","actorKind","version","occurredAt")
        SELECT (3000000000000 + g)::bigint, ${own.workspaceId}::bigint, ${pipeline.id}::bigint, g, g, 't', ${own.contactIds[0]}::bigint, 'created', 'user', 1, now()
        FROM generate_series(1, 1100) AS g`)

      await pipelineService.delete({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
      })

      const [{ items, activity }] = (
        await db.execute(sql`
          SELECT
            (SELECT count(*) FROM "PipelineItem" WHERE "pipelineId" = ${pipeline.id}::bigint)::int AS items,
            (SELECT count(*) FROM "PipelineItemActivity" WHERE "pipelineId" = ${pipeline.id}::bigint)::int AS activity`)
      ).rows as { items: number; activity: number }[]
      expect({ items, activity }).toEqual({ items: 0, activity: 0 })
      await expect(
        pipelineService.get({
          workspaceId: own.workspaceId,
          id: pipeline.id,
          scope: token,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })
    })

    test("a pipeline with a stage owned by a bulk job cannot be deleted", async () => {
      const pipeline = await newPipeline(own)
      const [first] = await stagesOf(own, pipeline.id)
      await db.execute(
        sql`UPDATE "PipelineStage" SET "bulkJobId" = 'job-1' WHERE "id" = ${first.id}::bigint`,
      )

      await expect(
        pipelineService.delete({
          workspaceId: own.workspaceId,
          id: pipeline.id,
          scope: token,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 409 })
    })

    test("deleting a field strips its key from more than one batch of items", async () => {
      const pipeline = await newPipeline(own)
      const [first] = await stagesOf(own, pipeline.id)
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: { name: "Note", referenceName: "note", type: "number" },
      })
      await db.execute(sql`
        INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","updatedAt")
        SELECT (4000000000000 + g)::bigint, ${own.workspaceId}::bigint, ${pipeline.id}::bigint, ${first.id}::bigint, ${own.contactIds[0]}::bigint, g, 'f ' || g, 'lost', 'low', jsonb_build_object(${field.id}::text, 'x', 'keep', 'y'), now(), now()
        FROM generate_series(1, 1100) AS g`)

      await pipelineStructureService.deleteField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        fieldId: field.id,
        scope: token,
      })

      const [{ stale, kept }] = (
        await db.execute(sql`
          SELECT
            count(*) FILTER (WHERE "fieldValues" ? ${field.id}::text)::int AS stale,
            count(*) FILTER (WHERE "fieldValues" ? 'keep')::int AS kept
          FROM "PipelineItem" WHERE "pipelineId" = ${pipeline.id}::bigint`)
      ).rows as { stale: number; kept: number }[]
      expect({ stale, kept }).toEqual({ stale: 0, kept: 1100 })
    })

    test("a queued job whose claim was replaced does nothing", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await seedBulkItems(own, pipeline.id, first.id)
      await pipelineStageBulkService.deleteStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        moveItemsToStageId: second.id,
        scope: token,
        actor,
      })
      await db.execute(
        sql`UPDATE "PipelineStage" SET "bulkJobId" = 'newer-claim' WHERE "id" = ${first.id}::bigint`,
      )

      await pipelineStageBulkService.processQueued({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
        bulkJobId: "stale-claim",
        moveItemsToStageId: null,
        actorUserId: null,
        actorKind: "user",
        actorSourceId: null,
      })

      const [row] = (
        await db.execute(sql`
          SELECT (SELECT count(*) FROM "PipelineItem" WHERE "stageId" = ${first.id}::bigint)::int AS items,
                 (SELECT count(*) FROM "PipelineStage" WHERE "id" = ${first.id}::bigint)::int AS stage`)
      ).rows as { items: number; stage: number }[]
      expect(row).toEqual({ items: 2001, stage: 1 })
    })

    test("a claim still inside its enqueue window is not taken over, an older one is", async () => {
      const pipeline = await newPipeline(own)
      await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      const claim = async (at: number) =>
        await db.execute(
          sql`UPDATE "PipelineStage" SET "bulkJobId" = ${pipelineStageBulkJobId(first.id, at)} WHERE "id" = ${first.id}::bigint`,
        )
      const deleteFirst = () =>
        pipelineStageBulkService.deleteStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          stageId: first.id,
          scope: token,
          actor,
        })

      // Another request committed its claim and is still enqueueing (no job yet).
      await claim(Date.now())
      await expect(deleteFirst()).rejects.toMatchObject({ httpStatusCode: 409 })

      // That request died before enqueueing: past the window the stage is free.
      await claim(Date.now() - STAGE_CLAIM_ENQUEUE_GRACE_MS - 1000)
      await expect(deleteFirst()).resolves.toMatchObject({ queued: false })
      expect(stageClaimCreatedAt(pipelineStageBulkJobId("7", 1234))).toBe(1234)
      expect(stageClaimCreatedAt("legacy-claim")).toBeNull()
    })

    test("a failed enqueue never clears a newer claim", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      const [first] = await stagesOf(own, pipeline.id)
      await seedBulkItems(own, pipeline.id, first.id)
      mocks.queueAdd.mockImplementationOnce(async () => {
        await db.execute(
          sql`UPDATE "PipelineStage" SET "bulkJobId" = 'newer' WHERE "id" = ${first.id}::bigint`,
        )
        throw new Error("redis down")
      })

      await expect(
        pipelineStageBulkService.deleteStage({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          stageId: first.id,
          moveItemsToStageId: second.id,
          scope: token,
          actor,
        }),
      ).rejects.toThrow("redis down")

      expect((await stagesOf(own, pipeline.id))[0].bulkJobId).toBe("newer")
    })

    test("releaseClaim clears only the claim the job holds", async () => {
      const pipeline = await newPipeline(own)
      const [first] = await stagesOf(own, pipeline.id)
      await db.execute(
        sql`UPDATE "PipelineStage" SET "bulkJobId" = 'newer' WHERE "id" = ${first.id}::bigint`,
      )
      const claim = {
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: first.id,
      }

      await pipelineStageBulkService.releaseClaim({
        ...claim,
        bulkJobId: "old",
      })
      expect((await stagesOf(own, pipeline.id))[0].bulkJobId).toBe("newer")

      await pipelineStageBulkService.releaseClaim({
        ...claim,
        bulkJobId: "newer",
      })
      expect((await stagesOf(own, pipeline.id))[0].bulkJobId).toBeNull()
    })

    test("naming the item's current stage while it is busy is a harmless no-op", async () => {
      const pipeline = await newPipeline(own)
      const [first] = await stagesOf(own, pipeline.id)
      const item = await newItem(own, pipeline.id)
      await db.execute(
        sql`UPDATE "PipelineStage" SET "bulkJobId" = 'job-1' WHERE "id" = ${first.id}::bigint`,
      )

      const moved = await pipelineItemService.update({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        fields: { stageId: first.id },
        scope: token,
        actor,
      })

      expect(moved.stageId).toBe(first.id)
    })

    test("two concurrent deletes of the last two comments leave lastCommentAt null", async () => {
      for (let round = 0; round < 5; round += 1) {
        const pipeline = await newPipeline(own, `Comments ${round}`)
        const item = await newItem(own, pipeline.id)
        const comments: Awaited<
          ReturnType<typeof pipelineItemContentService.addComment>
        >[] = []
        for (const text of ["a", "b"]) {
          comments.push(
            await pipelineItemContentService.addComment({
              workspaceId: own.workspaceId,
              pipelineId: pipeline.id,
              itemId: item.id,
              text,
              scope: token,
              actor,
            }),
          )
        }

        await Promise.all(
          comments.map((comment) =>
            pipelineItemContentService.deleteComment({
              workspaceId: own.workspaceId,
              pipelineId: pipeline.id,
              itemId: item.id,
              commentId: comment.id,
              scope: token,
              actor,
            }),
          ),
        )

        const [row] = (
          await db.execute(
            sql`SELECT "lastCommentAt" FROM "PipelineItem" WHERE "id" = ${item.id}::bigint`,
          )
        ).rows as { lastCommentAt: Date | null }[]
        expect(row.lastCommentAt).toBeNull()
      }
    })

    test("concurrent comment adds leave lastCommentAt at the newest comment", async () => {
      for (let round = 0; round < 5; round += 1) {
        const pipeline = await newPipeline(own, `Adds ${round}`)
        const item = await newItem(own, pipeline.id)

        const comments = await Promise.all(
          ["a", "b", "c", "d"].map((text) =>
            pipelineItemContentService.addComment({
              workspaceId: own.workspaceId,
              pipelineId: pipeline.id,
              itemId: item.id,
              text,
              scope: token,
              actor,
            }),
          ),
        )

        const [row] = (
          await db.execute(
            sql`SELECT "lastCommentAt" FROM "PipelineItem" WHERE "id" = ${item.id}::bigint`,
          )
        ).rows as { lastCommentAt: Date }[]
        const newest = Math.max(...comments.map((c) => c.createdAt.getTime()))
        expect(new Date(row.lastCommentAt).getTime()).toBe(newest)
      }
    })

    test("a write racing a field delete never leaves the deleted key behind", async () => {
      for (let round = 0; round < 8; round += 1) {
        const pipeline = await newPipeline(own, `Race fields ${round}`)
        const item = await newItem(own, pipeline.id)
        const field = await pipelineStructureService.createField({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
          values: {
            name: "K",
            referenceName: "k",
            type: "number",
            required: false,
          },
        })

        const results = await Promise.allSettled([
          pipelineItemService.update({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            itemId: item.id,
            fields: { fieldValues: { [field.id]: "7" } },
            scope: token,
            actor,
          }),
          pipelineStructureService.deleteField({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            fieldId: field.id,
            scope: token,
          }),
        ])

        expect(results[1].status).toBe("fulfilled")
        const [row] = (
          await db.execute(
            sql`SELECT ("fieldValues" ? ${field.id}::text) AS leaked FROM "PipelineItem" WHERE "id" = ${item.id}::bigint`,
          )
        ).rows as { leaked: boolean }[]
        expect(row.leaked).toBe(false)
      }
    })

    test("retrying an interrupted field delete still strips the key, then answers 404", async () => {
      const pipeline = await newPipeline(own)
      const [first] = await stagesOf(own, pipeline.id)
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: {
          name: "K",
          referenceName: "k",
          type: "number",
          required: false,
        },
      })
      await db.execute(sql`
        INSERT INTO "PipelineItem" ("id","workspaceId","pipelineId","stageId","contactId","number","title","status","priority","fieldValues","stageEnteredAt","updatedAt")
        SELECT (5000000000000 + g)::bigint, ${own.workspaceId}::bigint, ${pipeline.id}::bigint, ${first.id}::bigint, ${own.contactIds[0]}::bigint, g, 'i ' || g, 'lost', 'low', jsonb_build_object(${field.id}::text, '1', 'keep', 'y'), now(), now()
        FROM generate_series(1, 600) AS g`)
      // The row delete committed but the process died before the strip.
      await db.execute(
        sql`DELETE FROM "PipelineField" WHERE "id" = ${field.id}::bigint`,
      )

      await expect(
        pipelineStructureService.deleteField({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          fieldId: field.id,
          scope: token,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 404 })

      const [row] = (
        await db.execute(sql`
          SELECT count(*) FILTER (WHERE "fieldValues" ? ${field.id}::text)::int AS stale,
                 count(*) FILTER (WHERE "fieldValues" ? 'keep')::int AS kept
          FROM "PipelineItem" WHERE "pipelineId" = ${pipeline.id}::bigint`)
      ).rows as { stale: number; kept: number }[]
      expect(row).toEqual({ stale: 0, kept: 600 })
    })

    test("a write naming a deleted field is rejected", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: {
          name: "K",
          referenceName: "k",
          type: "number",
          required: false,
        },
      })
      await pipelineStructureService.deleteField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        fieldId: field.id,
        scope: token,
      })

      await expect(
        pipelineItemService.update({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          fields: { fieldValues: { [field.id]: "7" } },
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
      await expect(
        newItem(own, pipeline.id, {
          fields: { title: "x", fieldValues: { [field.id]: "7" } },
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
    })

    test("required fields added later can be filled one at a time but never cleared", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      const fields: Awaited<
        ReturnType<typeof pipelineStructureService.createField>
      >[] = []
      for (const name of ["A", "B"]) {
        fields.push(
          await pipelineStructureService.createField({
            workspaceId: own.workspaceId,
            pipelineId: pipeline.id,
            scope: token,
            values: {
              name,
              referenceName: name.toLowerCase(),
              type: "number",
              required: true,
            },
          }),
        )
      }
      const setField = (fieldId: string, value: string | null) =>
        pipelineItemService.update({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          fields: { fieldValues: { [fieldId]: value } },
          scope: token,
          actor,
        })

      const filled = await setField(fields[0].id, "5")
      expect(filled.fieldValues).toEqual({ [fields[0].id]: "5" })
      await expect(setField(fields[0].id, null)).rejects.toMatchObject({
        httpStatusCode: 422,
      })
    })

    test("the board hands out a cursor that resumes exactly after the first page", async () => {
      const pipeline = await newPipeline(own)
      for (let index = 0; index < 3; index += 1) {
        await newItem(own, pipeline.id, { fields: { title: `n${index}` } })
      }

      const board = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        perStageLimit: 2,
      })
      const [column] = board.stages
      const rest = await pipelineItemQueryService.listStagePage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: column.stage.id,
        scope: token,
        cursor: column.nextCursor ?? undefined,
      })

      expect(column.items).toHaveLength(2)
      expect(column.count).toBe(3)
      expect(column.nextCursor).not.toBeNull()
      expect(rest.items).toHaveLength(1)
      expect(
        new Set([...column.items, ...rest.items].map((view) => view.item.id))
          .size,
      ).toBe(3)
      expect(rest.nextCursor).toBeNull()
    })

    test("a partial settings update keeps every other stored setting", async () => {
      const pipeline = await pipelineService.create({
        workspaceId: own.workspaceId,
        type: "ticket",
        name: "Support",
        scope: token,
        actor,
      })
      await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
        values: { settings: { maxOpenItemsPerContact: 4 } },
      })

      const updated = await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
        values: { settings: { assignContactOnAssign: true } },
      })

      expect(updated.settings.assignContactOnAssign).toBe(true)
      expect(updated.settings.maxOpenItemsPerContact).toBe(4)
      expect(updated.settings.statusLabels.won).toBe("Resolved")
    })

    test("a cursor from another sort is a 422, not a server error", async () => {
      const pipeline = await newPipeline(own)
      for (let index = 0; index < 3; index += 1) {
        await newItem(own, pipeline.id, { fields: { title: `c${index}` } })
      }
      const first = await pipelineItemQueryService.listItems({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        limit: 1,
      })

      await expect(
        pipelineItemQueryService.listItems({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
          sort: { key: "value", direction: "asc" },
          cursor: first.nextCursor ?? undefined,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
      await expect(
        pipelineItemQueryService.listItems({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
          cursor: "not-a-cursor",
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
    })
  })

  describe("contact email and phone", () => {
    const restricted = (fixture: Fixture) =>
      ({
        kind: "member",
        workspaceMemberId: fixture.memberId,
        // Bypasses the pipeline ACL, so only the contact permission differs.
        isWorkspaceAdmin: true,
        canViewContactEmailAndPhone: false,
      }) as const

    const withContactPII = async (fixture: Fixture) => {
      await db
        .update(contactModel)
        .set({ email: "lead@example.test", phoneNumber: "84901234567" })
        .where(eq(contactModel.id, fixture.contactIds[0]))
    }

    test("are hidden from a member without the permission on every read", async () => {
      await withContactPII(own)
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)

      const board = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: restricted(own),
      })
      const detail = await pipelineItemQueryService.getItem({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        scope: restricted(own),
      })
      const forContact = await pipelineItemQueryService.listForContact({
        workspaceId: own.workspaceId,
        contactId: own.contactIds[0],
        scope: restricted(own),
      })
      const tokenBoard = await pipelineItemQueryService.listBoard({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })

      const hidden = { email: null, phoneNumber: null }
      expect(board.stages[0]?.items[0]?.contact).toMatchObject(hidden)
      expect(detail.contact).toMatchObject(hidden)
      expect(forContact[0]?.contact).toMatchObject(hidden)
      expect(tokenBoard.stages[0]?.items[0]?.contact).toMatchObject({
        email: "lead@example.test",
        phoneNumber: "84901234567",
      })
    })

    test("cannot be matched by a search from a member without the permission", async () => {
      await withContactPII(own)
      const pipeline = await newPipeline(own)
      await newItem(own, pipeline.id)
      const search = (
        scope: Parameters<
          typeof pipelineItemQueryService.listItems
        >[0]["scope"],
        text: string,
      ) =>
        pipelineItemQueryService.listItems({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope,
          filter: { search: text },
        })

      expect((await search(token, "lead@example")).items).toHaveLength(1)
      expect((await search(token, "901234567")).items).toHaveLength(1)
      expect((await search(restricted(own), "lead@example")).items).toEqual([])
      expect((await search(restricted(own), "901234567")).items).toEqual([])
    })
  })

  describe("templates and structure limits", () => {
    test("a template with same-named stages keeps one destination per source stage", async () => {
      const result = await db.transaction((tx) =>
        pipelineTemplateService.resolveTemplateEntry({
          tx,
          workspaceId: own.workspaceId,
          entry: {
            name: "Template",
            referenceName: "tpl_same_names",
            type: "opportunity",
            currency: null,
            settings: {},
            stages: [
              {
                sourceId: "s1",
                name: "Lead",
                description: null,
                textColor: null,
                backgroundColor: null,
              },
              {
                sourceId: "s2",
                name: "lead",
                description: null,
                textColor: null,
                backgroundColor: null,
              },
              {
                sourceId: "s3",
                name: "Won",
                description: null,
                textColor: null,
                backgroundColor: null,
              },
            ],
            fields: [],
          },
        }),
      )

      const destinations = ["s1", "s2", "s3"].map((id) =>
        result.stageIds.get(id),
      )
      expect(new Set(destinations).size).toBe(3)
      expect(await stagesOf(own, result.pipeline.id)).toHaveLength(3)
    })

    test("a pipeline holds at most the field count an item write can carry", async () => {
      const pipeline = await newPipeline(own)
      await db.execute(sql`
        INSERT INTO "PipelineField" ("id","workspaceId","pipelineId","name","referenceName","type","required","position","updatedAt")
        SELECT (6000000000000 + g)::bigint, ${own.workspaceId}::bigint, ${pipeline.id}::bigint, 'f' || g, 'f' || g, 'shortText', false, g, now()
        FROM generate_series(1, 100) AS g`)

      await expect(
        pipelineStructureService.createField({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          scope: token,
          values: {
            name: "One too many",
            referenceName: "extra",
            type: "shortText",
            required: false,
          },
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
    })
  })

  describe("stage totals", () => {
    test("counts and sums the matching items of every stage, in board order", async () => {
      const pipeline = await newPipeline(own)
      const second = await pipelineStructureService.createStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        name: "Second",
      })
      await newItem(own, pipeline.id, { fields: { title: "a", value: 10 } })
      await newItem(own, pipeline.id, {
        fields: { title: "b", value: 5, priority: "high" },
      })

      const all = await pipelineItemQueryService.listStageTotals({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
      })
      const high = await pipelineItemQueryService.listStageTotals({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        filter: { priorities: ["high"] },
      })

      expect(
        all.map(({ count, totalValue }) => ({ count, totalValue })),
      ).toEqual([
        { count: 2, totalValue: 15 },
        { count: 0, totalValue: 0 },
      ])
      expect(all[1]?.stageId).toBe(second.id)
      expect(high[0]).toMatchObject({ count: 1, totalValue: 5 })
    })
  })

  describe("attachment cap", () => {
    test("adding a file past the per-item cap is a 422 and attaches nothing", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      await db.execute(sql`
        INSERT INTO "MediaLibraryFile" ("id","workspaceId","name","path","mimeType","size","updatedAt")
        SELECT (7000000000000 + g)::bigint, ${own.workspaceId}::bigint, 'f' || g || '.png', 'cap/' || g || '.png', 'image/png', 10, now()
        FROM generate_series(1, 51) AS g`)
      await db.execute(sql`
        INSERT INTO "PipelineItemAttachment" ("id","workspaceId","itemId","mediaLibraryFileId","updatedAt")
        SELECT (8000000000000 + g)::bigint, ${own.workspaceId}::bigint, ${item.id}::bigint, (7000000000000 + g)::bigint, now()
        FROM generate_series(1, 50) AS g`)

      await expect(
        pipelineItemContentService.addAttachments({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          mediaLibraryFileIds: ["7000000000051"],
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
      const detail = await pipelineItemQueryService.getItem({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        scope: token,
      })
      expect(detail.attachments).toHaveLength(50)
    })
  })

  describe("empty patches", () => {
    test("updating a pipeline, stage or field with nothing to change returns it unchanged", async () => {
      const pipeline = await newPipeline(own)
      const [stage] = await stagesOf(own, pipeline.id)
      const field = await pipelineStructureService.createField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        scope: token,
        values: {
          name: "Source",
          referenceName: "source",
          type: "shortText",
          required: false,
        },
      })

      const samePipeline = await pipelineService.update({
        workspaceId: own.workspaceId,
        id: pipeline.id,
        scope: token,
        values: {},
      })
      const sameStage = await pipelineStructureService.updateStage({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        scope: token,
        values: {},
      })
      const sameField = await pipelineStructureService.updateField({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        fieldId: field.id,
        scope: token,
        values: {},
      })

      expect(samePipeline).toMatchObject({
        id: pipeline.id,
        name: pipeline.name,
      })
      expect(sameStage).toMatchObject({ id: stage.id, name: stage.name })
      expect(sameField).toMatchObject({ id: field.id, name: "Source" })
    })
  })

  describe("due date range", () => {
    test("a date the database cannot store is a 422 on create and update", async () => {
      const pipeline = await newPipeline(own)
      const yearZero = new Date("0000-01-01T00:00:00Z")

      await expect(
        newItem(own, pipeline.id, {
          fields: { title: "Deal", dueDate: yearZero },
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
      const item = await newItem(own, pipeline.id)
      await expect(
        pipelineItemService.update({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          fields: { dueDate: yearZero },
          scope: token,
          actor,
        }),
      ).rejects.toMatchObject({ httpStatusCode: 422 })
    })
  })

  describe("money precision", () => {
    test("repeating an over-precise value records one change, stored at four decimals", async () => {
      const pipeline = await newPipeline(own)
      const item = await newItem(own, pipeline.id)
      const setValue = () =>
        pipelineItemService.update({
          workspaceId: own.workspaceId,
          pipelineId: pipeline.id,
          itemId: item.id,
          fields: { value: 1.123_45 },
          scope: token,
          actor,
        })

      const first = await setValue()
      await setValue()
      const activity = await pipelineItemQueryService.listActivity({
        workspaceId: own.workspaceId,
        pipelineId: pipeline.id,
        itemId: item.id,
        scope: token,
      })

      expect(first.value).toBe(1.1235)
      expect(
        activity.items.filter((row) => row.kind === "valueChanged"),
      ).toHaveLength(1)
    })
  })
})
