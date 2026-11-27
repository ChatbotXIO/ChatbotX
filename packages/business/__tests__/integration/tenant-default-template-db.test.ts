// @vitest-environment node

/**
 * The white-label default template against a real Postgres: the staging
 * insert, the version pin, the cascades and the sweep read live in SQL, which
 * the mocked unit suites cannot prove.
 *
 * Commits for real, so each test deletes what it created. Needs the
 * `template_install_core` migration applied locally.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import {
  templateInstallationRepository,
  templateRepository,
  templateVersionRepository,
  tenantDefaultTemplateRepository,
} from "@chatbotx.io/database/repositories"
import {
  templateInstallationModel,
  templateModel,
  tenantDefaultTemplateEventModel,
  tenantDefaultTemplateModel,
  tenantModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type { EncryptedData } from "@chatbotx.io/encryption"
import { createId } from "@chatbotx.io/utils"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { afterEach, describe, expect, test, vi } from "vitest"
import { quotaEnforcementService } from "../../src/quota-enforcement/service"
import { stageTenantDefaultInstall } from "../../src/template/installation-stage"
import { workspaceService } from "../../src/workspace/service"

/** Stands in for the encrypted key; nothing here decrypts it. */
const SEALED_KEY: EncryptedData = {
  v: 1,
  iv: "0".repeat(24),
  text: "00",
  tag: "0".repeat(32),
}

const enqueued = vi.hoisted(() => vi.fn())
// No audit recorder is registered in a test process.
vi.mock("../../src/audit/dispatcher", () => ({
  dispatchAuditRecord: vi.fn(),
}))
// The real enqueue would talk to Redis; what the tests need is whether it ran.
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  enqueueInstallTemplate: enqueued,
}))

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
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

const databaseUrl = realDatabaseUrl()
const permissions = { allowEdit: false, allowDelete: false }
const HOUR = 3_600_000
const PUBLISHER_REF = /^[0-9a-f]{32}$/

describe.skipIf(!databaseUrl)("tenant default template", () => {
  const cleanup: {
    workspaceIds: string[]
    tenantIds: string[]
    userIds: string[]
  } = { workspaceIds: [], tenantIds: [], userIds: [] }

  afterEach(async () => {
    for (const id of cleanup.workspaceIds.splice(0)) {
      await db.delete(workspaceModel).where(eq(workspaceModel.id, id))
    }
    for (const id of cleanup.tenantIds.splice(0)) {
      await db.delete(tenantModel).where(eq(tenantModel.id, id))
    }
    for (const id of cleanup.userIds.splice(0)) {
      await db.delete(userModel).where(eq(userModel.id, id))
    }
  })

  const newWorkspace = async (ownerId: string, tenantId: string) => {
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: `tdt-${createId()}`, ownerId, tenantId })
      .returning({ id: workspaceModel.id })
    cleanup.workspaceIds.push(workspace.id)
    return workspace.id
  }

  /** A reseller tenant with a publishing workspace, a live template and a configured default. */
  const seed = async (
    templateOverrides: Partial<typeof templateModel.$inferInsert> = {},
    options: {
      publishedByAnotherUser?: boolean
      /** An existing tenant (the root one) instead of a new reseller tenant. */
      tenantId?: string
    } = {},
  ) => {
    const suffix = createId()
    const [owner] = await db
      .insert(userModel)
      .values({ email: `tdt-${suffix}@example.test` })
      .returning({ id: userModel.id })
    cleanup.userIds.push(owner.id)
    const tenant = options.tenantId
      ? { id: options.tenantId }
      : (
          await db
            .insert(tenantModel)
            .values({ ownerId: owner.id })
            .returning({ id: tenantModel.id })
        )[0]
    if (!options.tenantId) {
      cleanup.tenantIds.push(tenant.id)
    }
    // The tenant's own owner publishes, unless a test asks for someone else
    // (a sub-account of the white-label).
    let publisherId = owner.id
    if (options.publishedByAnotherUser) {
      const [other] = await db
        .insert(userModel)
        .values({ email: `tdt-pub-${suffix}@example.test` })
        .returning({ id: userModel.id })
      cleanup.userIds.push(other.id)
      publisherId = other.id
    }
    const publisherWorkspaceId = await newWorkspace(publisherId, tenant.id)
    const shareToken = `tok-${suffix}`
    const [template] = await db
      .insert(templateModel)
      .values({
        workspaceId: publisherWorkspaceId,
        tenantId: tenant.id,
        name: "Starter",
        selection: { mode: "all" } as never,
        payload: {} as never,
        categoryCounts: {} as never,
        formatVersion: 1,
        shareToken,
        shareEnabled: true,
        defaultPermissions: permissions,
        defaultAutoUpdate: true,
        version: 3,
        ...templateOverrides,
      })
      .returning({ id: templateModel.id })
    await tenantDefaultTemplateRepository.upsert({
      tenantId: tenant.id,
      templateId: template.id,
      encryptedKey: SEALED_KEY,
      keyHash: await sha256Hex(shareToken),
    })
    return {
      ownerId: owner.id,
      tenantId: tenant.id,
      templateId: template.id,
      publisherWorkspaceId,
      shareToken,
    }
  }

  type Seed = Awaited<ReturnType<typeof seed>>

  const stage = async (at: Seed) => {
    const workspaceId = await newWorkspace(at.ownerId, at.tenantId)
    const stagedId = await db.transaction((tx) =>
      stageTenantDefaultInstall(tx, { workspaceId, tenantId: at.tenantId }),
    )
    return { workspaceId, stagedId }
  }

  const installationsOf = (workspaceId: string) =>
    db
      .select()
      .from(templateInstallationModel)
      .where(eq(templateInstallationModel.workspaceId, workspaceId))

  const addVersion = (at: Seed, version: number) =>
    templateVersionRepository.insert({
      id: createId(),
      templateId: at.templateId,
      workspaceId: at.publisherWorkspaceId,
      version,
      payload: {} as never,
      payloadHash: `hash-${version}`,
      formatVersion: 1,
    })

  test("stages one pending tenantDefault install with the template's defaults, the publisher granted", async () => {
    const at = await seed()
    await addVersion(at, 3)

    const { workspaceId, stagedId } = await stage(at)

    const rows = await installationsOf(workspaceId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: stagedId,
      status: "pending",
      templateId: at.templateId,
      sourceTemplateId: at.templateId,
      templateName: "Starter",
      sourceWorkspaceId: at.publisherWorkspaceId,
      sourceVersion: 3,
      autoUpdate: true,
      permissions,
      installedBy: null,
      installedByKind: "apiToken",
      installSource: "tenantDefault",
      publisherUninstallGrant: 1,
    })
    expect(rows[0].publisherRef).toMatch(PUBLISHER_REF)
  })

  test("a workspace created in the root tenant gets the root tenant's default", async () => {
    // The root tenant is shared with the rest of the dev database: keep its
    // real default and put it back whatever happens.
    const [saved] = await db
      .select()
      .from(tenantDefaultTemplateModel)
      .where(eq(tenantDefaultTemplateModel.tenantId, ROOT_TENANT_ID))
    try {
      const at = await seed({}, { tenantId: ROOT_TENANT_ID })

      const { workspaceId, stagedId } = await stage(at)

      expect(stagedId).not.toBeNull()
      expect(await installationsOf(workspaceId)).toEqual([
        expect.objectContaining({
          id: stagedId,
          templateId: at.templateId,
          installSource: "tenantDefault",
          publisherUninstallGrant: 1,
        }),
      ])
    } finally {
      await tenantDefaultTemplateRepository.delete(ROOT_TENANT_ID)
      if (saved) {
        await db.insert(tenantDefaultTemplateModel).values(saved)
      }
    }
  })

  test("stages nothing for a tenant without a default or a suspended one", async () => {
    const at = await seed()
    await tenantDefaultTemplateRepository.delete(at.tenantId)
    expect((await stage(at)).stagedId).toBeNull()

    await tenantDefaultTemplateRepository.upsert({
      tenantId: at.tenantId,
      templateId: at.templateId,
      encryptedKey: SEALED_KEY,
      keyHash: await sha256Hex(at.shareToken),
    })
    await db
      .update(tenantModel)
      .set({ status: "suspended" })
      .where(eq(tenantModel.id, at.tenantId))
    const suspended = await stage(at)
    expect(suspended.stagedId).toBeNull()
    expect(await installationsOf(suspended.workspaceId)).toHaveLength(0)
  })

  test.each([
    ["the key was rotated", { shareToken: "rotated-token" }],
    ["the share link is off", { shareEnabled: false }],
    ["the share link expired", { shareExpiresAt: new Date(Date.now() - HOUR) }],
    ["the template was deleted", { deletedAt: new Date() }],
  ])("skips the install when %s, leaving the workspace creatable", async (_name, change) => {
    const at = await seed()
    await db
      .update(templateModel)
      .set(change)
      .where(eq(templateModel.id, at.templateId))

    const { workspaceId, stagedId } = await stage(at)

    expect(stagedId).toBeNull()
    expect(await installationsOf(workspaceId)).toHaveLength(0)
  })

  test("rolls the install back with the workspace transaction", async () => {
    const at = await seed()
    const workspaceId = await newWorkspace(at.ownerId, at.tenantId)

    await expect(
      db.transaction(async (tx) => {
        await stageTenantDefaultInstall(tx, {
          workspaceId,
          tenantId: at.tenantId,
        })
        throw new Error("creation failed after staging")
      }),
    ).rejects.toThrow("creation failed after staging")

    expect(await installationsOf(workspaceId)).toHaveLength(0)
  })

  test("a second staging for the same workspace is an operational error, not a silent duplicate", async () => {
    const at = await seed()
    const { workspaceId } = await stage(at)

    await expect(
      db.transaction((tx) =>
        stageTenantDefaultInstall(tx, { workspaceId, tenantId: at.tenantId }),
      ),
    ).rejects.toThrow()
    expect(await installationsOf(workspaceId)).toHaveLength(1)
  })

  const configRowsOf = (tenantId: string) =>
    db
      .select()
      .from(tenantDefaultTemplateModel)
      .where(eq(tenantDefaultTemplateModel.tenantId, tenantId))

  test("the config disappears with its template", async () => {
    const at = await seed()
    expect(await configRowsOf(at.tenantId)).toHaveLength(1)

    await db.delete(templateModel).where(eq(templateModel.id, at.templateId))

    expect(await configRowsOf(at.tenantId)).toHaveLength(0)
  })

  test("the config disappears with its tenant even when its template survives", async () => {
    const tenant = await seed()
    const survivor = await seed()
    // Point the tenant's default at the other tenant's template, so only the
    // tenant cascade can remove the row.
    await tenantDefaultTemplateRepository.upsert({
      tenantId: tenant.tenantId,
      templateId: survivor.templateId,
      encryptedKey: SEALED_KEY,
      keyHash: await sha256Hex(survivor.shareToken),
    })
    await db
      .delete(workspaceModel)
      .where(eq(workspaceModel.id, tenant.publisherWorkspaceId))

    await db.delete(tenantModel).where(eq(tenantModel.id, tenant.tenantId))

    expect(await configRowsOf(tenant.tenantId)).toHaveLength(0)
    const [template] = await db
      .select({ id: templateModel.id })
      .from(templateModel)
      .where(eq(templateModel.id, survivor.templateId))
    expect(template?.id).toBe(survivor.templateId)
  })

  test("upsert replaces the tenant's one default", async () => {
    const at = await seed()
    const [other] = await db
      .insert(templateModel)
      .values({
        workspaceId: at.publisherWorkspaceId,
        tenantId: at.tenantId,
        name: "Second",
        selection: { mode: "all" } as never,
        payload: {} as never,
        categoryCounts: {} as never,
        formatVersion: 1,
        shareToken: `tok-${createId()}`,
        defaultPermissions: permissions,
        version: 1,
      })
      .returning({ id: templateModel.id })

    await tenantDefaultTemplateRepository.upsert({
      tenantId: at.tenantId,
      templateId: other.id,
      encryptedKey: SEALED_KEY,
      keyHash: "new-hash",
    })

    const config = await tenantDefaultTemplateRepository.findWithTemplate(
      at.tenantId,
    )
    expect(config?.template.id).toBe(other.id)
    expect(config?.keyHash).toBe("new-hash")
  })

  describe("history of the default", () => {
    const eventsOf = (tenantId: string) =>
      db
        .select()
        .from(tenantDefaultTemplateEventModel)
        .where(eq(tenantDefaultTemplateEventModel.tenantId, tenantId))
        .orderBy(tenantDefaultTemplateEventModel.id)

    test("delete hands back the template it removed, once", async () => {
      const at = await seed()

      expect(await tenantDefaultTemplateRepository.delete(at.tenantId)).toBe(
        at.templateId,
      )
      expect(
        await tenantDefaultTemplateRepository.delete(at.tenantId),
      ).toBeNull()
    })

    test("keeps who set and cleared which template, in order", async () => {
      const at = await seed()

      await tenantDefaultTemplateRepository.recordEvent({
        tenantId: at.tenantId,
        action: "set",
        templateId: at.templateId,
        actorUserId: at.ownerId,
      })
      await tenantDefaultTemplateRepository.recordEvent({
        tenantId: at.tenantId,
        action: "cleared",
        templateId: at.templateId,
        actorUserId: at.ownerId,
      })

      const events = await eventsOf(at.tenantId)
      expect(events.map((event) => event.action)).toEqual(["set", "cleared"])
      expect(events.every((event) => event.templateId === at.templateId)).toBe(
        true,
      )
      expect(events.every((event) => event.actorUserId === at.ownerId)).toBe(
        true,
      )
    })

    test("outlives a deleted template, loses the actor with a deleted user, and goes with its tenant", async () => {
      const at = await seed()
      const [actor] = await db
        .insert(userModel)
        .values({ email: `tdt-actor-${createId()}@example.test` })
        .returning({ id: userModel.id })
      cleanup.userIds.push(actor.id)
      await tenantDefaultTemplateRepository.recordEvent({
        tenantId: at.tenantId,
        action: "set",
        templateId: at.templateId,
        actorUserId: actor.id,
      })

      await db.delete(templateModel).where(eq(templateModel.id, at.templateId))
      expect(await eventsOf(at.tenantId)).toHaveLength(1)

      await db.delete(userModel).where(eq(userModel.id, actor.id))
      expect((await eventsOf(at.tenantId))[0].actorUserId).toBeNull()

      await db
        .delete(workspaceModel)
        .where(eq(workspaceModel.id, at.publisherWorkspaceId))
      await db.delete(tenantModel).where(eq(tenantModel.id, at.tenantId))
      expect(await eventsOf(at.tenantId)).toHaveLength(0)
    })
  })

  describe("through workspaceService.create", () => {
    const createdNames: string[] = []

    // The seat is a Redis/plan concern outside what these tests prove; the
    // database transaction behaviour is the real thing.
    const stubSeat = () => {
      vi.spyOn(quotaEnforcementService, "tryConsume").mockResolvedValue({
        ok: true,
      } as never)
      vi.spyOn(quotaEnforcementService, "release").mockResolvedValue(
        undefined as never,
      )
    }

    afterEach(async () => {
      for (const name of createdNames.splice(0)) {
        await db.delete(workspaceModel).where(eq(workspaceModel.name, name))
      }
      vi.restoreAllMocks()
      enqueued.mockReset()
    })

    const workspacesNamed = (name: string) =>
      db.select().from(workspaceModel).where(eq(workspaceModel.name, name))
    /** Community editions allow one workspace per owner, so each creation gets an owner with none. */
    const newCreator = async () => {
      const [creator] = await db
        .insert(userModel)
        .values({ email: `tdt-creator-${createId()}@example.test` })
        .returning({ id: userModel.id })
      cleanup.userIds.push(creator.id)
      return creator.id
    }
    const newName = () => {
      const name = `tdt-create-${createId()}`
      createdNames.push(name)
      return name
    }

    test("a creation in a configured tenant commits the workspace with its staged install, then dispatches it", async () => {
      const at = await seed()
      const name = newName()
      const creatorId = await newCreator()
      stubSeat()

      const workspace = await workspaceService.create({
        data: { name, ownerId: creatorId, tenantId: at.tenantId },
        createdBy: creatorId,
      })

      const installs = await installationsOf(workspace.id)
      expect(installs).toHaveLength(1)
      expect(installs[0]).toMatchObject({
        status: "pending",
        installSource: "tenantDefault",
      })
      expect(enqueued).toHaveBeenCalledWith({
        installationId: installs[0].id,
        workspaceId: workspace.id,
      })
    })

    test("a staging failure aborts the whole creation: no workspace, no install, no dispatch", async () => {
      const at = await seed()
      const name = newName()
      const creatorId = await newCreator()
      stubSeat()
      vi.spyOn(templateInstallationRepository, "create").mockRejectedValueOnce(
        new Error("deadlock detected"),
      )

      await expect(
        workspaceService.create({
          data: { name, ownerId: creatorId, tenantId: at.tenantId },
          createdBy: creatorId,
        }),
      ).rejects.toThrow("deadlock detected")

      expect(await workspacesNamed(name)).toHaveLength(0)
      expect(enqueued).not.toHaveBeenCalled()
    })

    test("a caller-owned transaction that rolls back after create leaves nothing and never dispatches", async () => {
      const at = await seed()
      const name = newName()
      const creatorId = await newCreator()
      stubSeat()

      await expect(
        db.transaction(async (tx) => {
          await workspaceService.create({
            data: { name, ownerId: creatorId, tenantId: at.tenantId },
            createdBy: creatorId,
            tx,
          })
          throw new Error("caller failed after create")
        }),
      ).rejects.toThrow("caller failed after create")

      expect(await workspacesNamed(name)).toHaveLength(0)
      expect(enqueued).not.toHaveBeenCalled()
    })
  })

  describe("pinVersionNumber", () => {
    test("keeps the requested version when it exists, even if a newer one is stored", async () => {
      const at = await seed()
      await addVersion(at, 2)
      await addVersion(at, 5)

      const pinned = await db.transaction((tx) =>
        templateVersionRepository.pinVersionNumber(
          { templateId: at.templateId, requestedVersion: 2 },
          tx,
        ),
      )

      expect(pinned).toBe(2)
    })

    test("falls back to the newest stored version when the requested one was pruned", async () => {
      const at = await seed()
      await addVersion(at, 4)
      await addVersion(at, 6)

      const pinned = await db.transaction((tx) =>
        templateVersionRepository.pinVersionNumber(
          { templateId: at.templateId, requestedVersion: 1 },
          tx,
        ),
      )

      expect(pinned).toBe(6)
    })

    test("takes a shared lock: concurrent pins never wait for each other, only the prune does", async () => {
      const at = await seed()
      await addVersion(at, 3)
      const pin = (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) =>
        templateVersionRepository.pinVersionNumber(
          { templateId: at.templateId, requestedVersion: 3 },
          tx,
        )

      await db.transaction(async (holder) => {
        await pin(holder)

        // A second creation pins while the first still holds its transaction open.
        await expect(
          db.transaction(async (other) => {
            // A regression to an exclusive lock would wait on the holder
            // forever; fail fast instead of hanging the suite.
            await other.execute(sql`SET LOCAL lock_timeout = '2s'`)
            return await pin(other)
          }),
        ).resolves.toBe(3)

        // The prune's exclusive lock has to wait for the holder.
        await expect(
          db.transaction(async (prune) => {
            await prune.execute(sql`SET LOCAL lock_timeout = '300ms'`)
            await templateVersionRepository.lockVersions(at.templateId, prune)
          }),
        ).rejects.toThrow()
      })
    })

    test("returns the requested number when no version row exists", async () => {
      const at = await seed()

      const pinned = await db.transaction((tx) =>
        templateVersionRepository.pinVersionNumber(
          { templateId: at.templateId, requestedVersion: 3 },
          tx,
        ),
      )

      expect(pinned).toBe(3)
    })
  })

  describe("recovery and provenance", () => {
    test("lists a workspace's pending installs for dispatch, whatever staged them", async () => {
      const at = await seed()
      const { workspaceId, stagedId } = await stage(at)
      // Each fixture differs from the wanted row in exactly one predicate.
      const sibling = (
        over: Pick<
          typeof templateInstallationModel.$inferInsert,
          "status" | "installSource"
        >,
      ) =>
        templateInstallationRepository.create({
          workspaceId,
          templateId: at.templateId,
          sourceTemplateId: createId(),
          templateName: "Sibling",
          sourceWorkspaceId: at.publisherWorkspaceId,
          formatVersion: 1,
          permissions,
          publisherRef: createId(),
          ...over,
        })
      const manual = await sibling({
        status: "pending",
        installSource: "manual",
      })
      await sibling({ status: "completed", installSource: "tenantDefault" })
      const other = await stage(at)

      expect(
        (
          await templateInstallationRepository.listPendingIds(workspaceId)
        ).sort(),
      ).toEqual([stagedId, manual.id].sort())
      expect(
        await templateInstallationRepository.listPendingIds(other.workspaceId),
      ).toEqual([other.stagedId])
    })

    test("the publisher's installer rows flag copies a white-label default installed", async () => {
      const at = await seed()
      const auto = await stage(at)
      const manualWorkspaceId = await newWorkspace(at.ownerId, at.tenantId)
      await templateInstallationRepository.create({
        workspaceId: manualWorkspaceId,
        templateId: at.templateId,
        sourceTemplateId: at.templateId,
        templateName: "Manual",
        sourceWorkspaceId: at.publisherWorkspaceId,
        formatVersion: 1,
        status: "completed",
        permissions,
        publisherRef: "manual-publisher-ref",
      })
      const refOf = async (workspaceId: string) =>
        (await installationsOf(workspaceId))[0].publisherRef

      // The staged copy is pending; a pending row is not listed until it
      // finishes, so complete it as the worker would.
      await db
        .update(templateInstallationModel)
        .set({ status: "completed" })
        .where(eq(templateInstallationModel.workspaceId, auto.workspaceId))
      const rows = await templateRepository.listPublisherRows({
        templateId: at.templateId,
        limit: 10,
      })

      const flagOf = (ref: string) =>
        rows.find((row) => row.publisherRef === ref)?.installedAutomatically
      expect(flagOf(await refOf(auto.workspaceId))).toBe(true)
      expect(flagOf("manual-publisher-ref")).toBe(false)
    })

    test("the sweep's stale read finds a staged install nobody dispatched", async () => {
      // Bounded to this test's own window, so unrelated rows in a shared
      // database cannot fill the page before this one.
      const windowStart = new Date(Date.now() - 2000)
      const at = await seed()
      const { stagedId } = await stage(at)

      const stale = await templateInstallationRepository.listStale({
        pendingBefore: new Date(Date.now() + HOUR),
        leaseExpiredBefore: new Date(Date.now() + HOUR),
        createdAfter: windowStart,
        limit: 100,
      })

      expect(stale.map((row) => row.id)).toContain(stagedId)
    })

    test("a template someone else published is staged with the publisher granted too", async () => {
      const at = await seed({}, { publishedByAnotherUser: true })
      const { workspaceId } = await stage(at)

      expect((await installationsOf(workspaceId))[0]).toMatchObject({
        installSource: "tenantDefault",
        publisherUninstallGrant: 1,
      })
    })

    test("a retried failed tenantDefault install keeps its source and its consent", async () => {
      const at = await seed()
      const { workspaceId, stagedId } = await stage(at)
      await db
        .update(templateInstallationModel)
        .set({ status: "failed", errorCode: "templateInstallFailed" })
        .where(eq(templateInstallationModel.id, stagedId as string))

      const reset = await templateInstallationRepository.resetFailed({
        id: stagedId as string,
        workspaceId,
        installedBy: null,
        installedByKind: "apiToken",
      })

      expect(reset).toMatchObject({
        status: "pending",
        installSource: "tenantDefault",
        publisherUninstallGrant: 1,
      })
    })

    test("an auto install starts granted and an API caller can still turn it off", async () => {
      const at = await seed({}, { publishedByAnotherUser: true })
      const { workspaceId } = await stage(at)
      const key = { workspaceId, sourceTemplateId: at.templateId }

      expect(
        await templateInstallationRepository.findPublisherUninstallGrant(key),
      ).toBe(1)

      await templateInstallationRepository.setPublisherUninstallGrant({
        ...key,
        granted: false,
      })
      expect(
        await templateInstallationRepository.findPublisherUninstallGrant(key),
      ).toBe(0)
    })

    test("tells a copy that crosses tenants from one that does not", async () => {
      const a = await seed()
      const b = await seed()
      const sameTenant = await newWorkspace(a.ownerId, a.tenantId)
      const otherTenant = await newWorkspace(b.ownerId, b.tenantId)

      expect(
        await templateInstallationRepository.findCopyTenants({
          sourceTemplateId: a.templateId,
          workspaceId: sameTenant,
        }),
      ).toEqual({ templateTenantId: a.tenantId, targetTenantId: a.tenantId })
      expect(
        await templateInstallationRepository.findCopyTenants({
          sourceTemplateId: a.templateId,
          workspaceId: otherTenant,
        }),
      ).toEqual({ templateTenantId: a.tenantId, targetTenantId: b.tenantId })
      expect(
        await templateInstallationRepository.findCopyTenants({
          sourceTemplateId: createId(),
          workspaceId: sameTenant,
        }),
      ).toBeNull()
    })

    test("an install inserted without a source reads manual (physical column default)", async () => {
      const at = await seed()
      const workspaceId = await newWorkspace(at.ownerId, at.tenantId)

      const created = await templateInstallationRepository.create({
        workspaceId,
        templateId: at.templateId,
        sourceTemplateId: at.templateId,
        templateName: "Legacy",
        sourceWorkspaceId: at.publisherWorkspaceId,
        formatVersion: 1,
        status: "completed",
        permissions,
        publisherRef: "legacy-ref",
      })

      expect(created.installSource).toBe("manual")
    })
  })
})
