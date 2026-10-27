import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  PIPELINE_LIMITS,
  pipelineReferenceNameSchema,
  pipelineSettingsSchema,
  pipelineTypeDefaults,
} from "@chatbotx.io/database/partials"
import {
  acquirePipelineAdvisoryLock,
  pipelineRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import type { TemplatePipelineManifestEntry } from "@chatbotx.io/flow-config"
import { nextFieldPosition } from "./naming"
import { PipelineBaseService } from "./pipeline-base.service"
import { stageColumns } from "./pipeline-structure.service"

/** Template installs: match-or-create a pipeline, its stages and fields. */
export class PipelineTemplateService extends PipelineBaseService {
  // Template install ----------------------------------------------------------

  /**
   * Finds the pipeline with the entry's reference name or creates it, then
   * matches stages by name and fields by reference name, adding the missing
   * ones. Runs inside the template install transaction; the caller drops the
   * list cache after commit. `unmatchedFields` are fields whose reference
   * name exists with a different type — their ids stay unmapped.
   */
  async resolveTemplateEntry(input: {
    tx: DatabaseClient
    workspaceId: string
    entry: TemplatePipelineManifestEntry
  }) {
    const { tx, workspaceId, entry } = input
    await acquirePipelineAdvisoryLock(tx, this.namingLockKey(workspaceId))
    let pipeline = await pipelineRepository.findByReferenceName(
      { workspaceId, referenceName: entry.referenceName },
      tx,
    )
    const created = !pipeline
    if (!pipeline) {
      const { name, referenceName } = await this.allocateNames(
        { workspaceId, name: entry.name },
        tx,
      )
      const parsedSettings = pipelineSettingsSchema.safeParse(entry.settings)
      const currency =
        entry.currency && PIPELINE_LIMITS.currencyPattern.test(entry.currency)
          ? entry.currency
          : await this.defaultCurrency(workspaceId)
      pipeline = await pipelineRepository.insert(
        {
          workspaceId,
          name,
          type: entry.type,
          // The reference name is free (looked up above), so keep it stable
          // across workspaces; only a malformed one falls back to derived.
          referenceName: pipelineReferenceNameSchema.safeParse(
            entry.referenceName,
          ).success
            ? entry.referenceName
            : referenceName,
          currency,
          settings: parsedSettings.success
            ? parsedSettings.data
            : this.defaultSettingsFor(entry.type),
          createdById: null,
        },
        tx,
      )
    }
    const pipelineId = pipeline.id
    await acquirePipelineAdvisoryLock(
      tx,
      this.structureLockKey(workspaceId, pipelineId),
    )

    const stages = await pipelineStageRepository.listByPipeline(
      { workspaceId, pipelineId },
      tx,
    )
    const stageIds = new Map<string, string>()
    const unmatchedStages: string[] = []
    const stageByName = new Map(
      stages.map((stage) => [stage.name.trim().toLowerCase(), stage]),
    )
    let stageCount = stages.length
    if (created && entry.stages.length === 0 && stageCount === 0) {
      await pipelineStageRepository.insert(
        {
          workspaceId,
          pipelineId,
          name: pipelineTypeDefaults[entry.type].firstStageName,
          position: 0,
        },
        tx,
      )
    }
    for (const source of entry.stages) {
      const key = source.name.trim().toLowerCase()
      const existing = stageByName.get(key)
      if (existing) {
        stageIds.set(source.sourceId, existing.id)
        continue
      }
      if (stageCount >= PIPELINE_LIMITS.stagesPerPipeline) {
        unmatchedStages.push(source.sourceId)
        continue
      }
      const row = await pipelineStageRepository.insert(
        {
          workspaceId,
          pipelineId,
          position: stageCount,
          ...stageColumns({
            name: source.name,
            description: source.description,
            textColor: this.validColor(source.textColor),
            backgroundColor: this.validColor(source.backgroundColor),
          }),
          name: source.name,
        },
        tx,
      )
      stageCount += 1
      stageByName.set(key, row)
      stageIds.set(source.sourceId, row.id)
    }

    const fields = await pipelineRepository.listFields(
      { workspaceId, pipelineId },
      tx,
    )
    const fieldByReference = new Map(
      fields.map((field) => [field.referenceName, field]),
    )
    const fieldIds = new Map<string, string>()
    const unmatchedFields: string[] = []
    let nextPosition = nextFieldPosition(fields)
    for (const source of entry.fields) {
      const existing = fieldByReference.get(source.referenceName)
      if (existing) {
        if (existing.type === source.type) {
          fieldIds.set(source.sourceId, existing.id)
        } else {
          unmatchedFields.push(source.sourceId)
        }
        continue
      }
      const row = await pipelineRepository.insertField(
        {
          workspaceId,
          pipelineId,
          position: nextPosition,
          name: source.name,
          referenceName: source.referenceName,
          type: source.type,
          required: source.required,
        },
        tx,
      )
      nextPosition += 1
      fieldByReference.set(source.referenceName, row)
      fieldIds.set(source.sourceId, row.id)
    }
    return {
      pipeline,
      created,
      stageIds,
      fieldIds,
      unmatchedStages,
      unmatchedFields,
    }
  }

  private validColor(color: string | null): string | null {
    return color && PIPELINE_LIMITS.colorPattern.test(color) ? color : null
  }
}

export const pipelineTemplateService = new PipelineTemplateService()
