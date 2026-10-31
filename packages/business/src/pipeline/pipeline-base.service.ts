import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  PIPELINE_LIMITS,
  type PipelineType,
  pipelineSettingsSchema,
  pipelineTypeDefaults,
  referenceNameFromName,
} from "@chatbotx.io/database/partials"
import {
  acquirePipelineAdvisoryLock,
  pipelineRepository,
} from "@chatbotx.io/database/repositories"
import type { PipelineModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import {
  ChatbotXException,
  notFoundException,
  validationException,
} from "../errors"
import { assertResourceEditable } from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
import {
  type PipelineAccessScope,
  type PipelineAction,
  type PipelinePermissions,
  permitsPipelineAction,
  resolvePipelinePermissions,
} from "./access"
import { dispatchPipelineEffects, realtimeEffect } from "./mutation-engine"
import { allocateUniqueName } from "./naming"

export type PipelineAccessInput = {
  workspaceId: string
  pipelineId: string
  scope: PipelineAccessScope
}

/**
 * Access checks, cache invalidation, locks and naming shared by the pipeline
 * pipeline services (pipelines, structure, members, templates), which each
 * extend it as siblings.
 */
export class PipelineBaseService extends BaseService {
  // Cache ---------------------------------------------------------------------

  /** One tag per workspace; the cached pipeline list drops it on every pipeline or structure change. */
  protected cacheTag(workspaceId: string) {
    return `pipelines:${workspaceId}`
  }

  /** Drops the cached pipeline list; used after a template install commits. */
  invalidateList(workspaceId: string) {
    return this.invalidateCacheTags(this.cacheTag(workspaceId))
  }

  // Access --------------------------------------------------------------------

  /** Effective permissions of the scope on a pipeline (no pipeline lookup). */
  async permissionsFor(
    input: PipelineAccessInput & { tx?: DatabaseClient },
  ): Promise<PipelinePermissions> {
    const { scope, tx = db } = input
    if (scope.kind !== "member" || scope.isWorkspaceAdmin) {
      return resolvePipelinePermissions(scope, null)
    }
    const row = await pipelineRepository.findMember(
      {
        workspaceId: input.workspaceId,
        pipelineId: input.pipelineId,
        workspaceMemberId: scope.workspaceMemberId,
      },
      tx,
    )
    return resolvePipelinePermissions(scope, row ?? null)
  }

  /**
   * The pipeline and the scope's permissions on it when the scope may perform
   * `action`. A scope that cannot even view it gets "not found" so existence
   * is never disclosed.
   */
  async requireAccessWithPermissions(
    input: PipelineAccessInput & {
      action: PipelineAction
      tx?: DatabaseClient
    },
  ): Promise<{ pipeline: PipelineModel; permissions: PipelinePermissions }> {
    const pipeline = await pipelineRepository.findById(
      { workspaceId: input.workspaceId, id: input.pipelineId },
      input.tx,
    )
    if (!pipeline) {
      throw notFoundException("Pipeline not found")
    }
    const permissions = await this.permissionsFor(input)
    if (!permissions.canView) {
      throw notFoundException("Pipeline not found")
    }
    if (!permitsPipelineAction(permissions, input.action)) {
      throw new ChatbotXException(
        "You do not have permission to do this on this pipeline",
        "forbidden",
        403,
      )
    }
    return { pipeline, permissions }
  }

  async requireAccess(
    input: PipelineAccessInput & {
      action: PipelineAction
      tx?: DatabaseClient
    },
  ): Promise<PipelineModel> {
    return (await this.requireAccessWithPermissions(input)).pipeline
  }

  // Locks ---------------------------------------------------------------------

  protected namingLockKey(workspaceId: string) {
    return `pipeline-naming:${workspaceId}`
  }

  /** Shared with the stage bulk operations so they serialise with structure edits. */
  structureLockKey(workspaceId: string, pipelineId: string) {
    return `pipeline-structure:${workspaceId}:${pipelineId}`
  }

  /**
   * Runs `work` in a transaction holding the pipeline's structure lock, after
   * checking the scope may manage its settings.
   */
  protected async structureTransaction<T>(
    input: PipelineAccessInput,
    work: (tx: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    await this.requireAccess({ ...input, action: "manageSettings" })
    return await withTemplateLockedTransaction(
      async (tx) => {
        // Every structural edit (stages and custom fields) is locked content.
        await assertResourceEditable({
          workspaceId: input.workspaceId,
          resourceKind: "pipeline",
          resourceIds: [input.pipelineId],
          changedKeys: ["stages", "fields"],
          tx,
        })
        await acquirePipelineAdvisoryLock(
          tx,
          this.structureLockKey(input.workspaceId, input.pipelineId),
        )
        return await work(tx)
      },
      {
        workspaceId: input.workspaceId,
        initialKeys: [{ kind: "pipeline", resourceId: input.pipelineId }],
      },
    )
  }

  /** `structureTransaction`, then drops the list cache and refreshes open boards. */
  protected async withStructure<T>(
    input: PipelineAccessInput,
    work: (tx: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    const result = await this.structureTransaction(input, work)
    await this.afterStructureChange(input.workspaceId, input.pipelineId)
    return result
  }

  protected async afterStructureChange(
    workspaceId: string,
    pipelineId: string,
  ) {
    await this.invalidateList(workspaceId)
    await dispatchPipelineEffects([
      realtimeEffect({ workspaceId, pipelineId }, "updated"),
    ])
  }

  // Naming and defaults -------------------------------------------------------

  protected defaultSettingsFor(type: PipelineType) {
    return pipelineSettingsSchema.parse({
      statusLabels: pipelineTypeDefaults[type].statusLabels,
    })
  }

  /** Names/reference names free in the workspace, suffixed when taken. */
  protected async allocateNames(
    input: { workspaceId: string; name: string },
    tx: DatabaseClient,
  ) {
    const baseName = input.name.trim().slice(0, PIPELINE_LIMITS.name)
    const baseReference = referenceNameFromName(baseName, "pipeline")
    const [names, references] = await Promise.all([
      pipelineRepository.listNamesStartingWith(
        {
          workspaceId: input.workspaceId,
          column: "name",
          prefix: baseName.slice(0, PIPELINE_LIMITS.name - 4),
        },
        tx,
      ),
      pipelineRepository.listNamesStartingWith(
        {
          workspaceId: input.workspaceId,
          column: "referenceName",
          prefix: baseReference.slice(0, 60),
        },
        tx,
      ),
    ])
    return {
      name: allocateUniqueName(baseName, names, "name"),
      referenceName: allocateUniqueName(
        baseReference,
        references,
        "referenceName",
      ),
    }
  }

  protected async assertNameFree(
    input: {
      workspaceId: string
      column: "name" | "referenceName"
      value: string
      exceptId: string
    },
    tx: DatabaseClient,
  ) {
    const clash =
      input.column === "name"
        ? await pipelineRepository.findByName(
            { workspaceId: input.workspaceId, name: input.value },
            tx,
          )
        : await pipelineRepository.findByReferenceName(
            { workspaceId: input.workspaceId, referenceName: input.value },
            tx,
          )
    if (clash && clash.id !== input.exceptId) {
      throw validationException(
        input.column,
        "This name is already used by another pipeline",
      )
    }
  }
}
