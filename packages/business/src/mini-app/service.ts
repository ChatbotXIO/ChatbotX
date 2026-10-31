import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import {
  type MiniAppListInput,
  miniAppRepository,
} from "@chatbotx.io/database/repositories"
import { miniAppModel } from "@chatbotx.io/database/schema"
import type { MiniAppModel } from "@chatbotx.io/database/types"
import {
  type MiniAppDefinition,
  type MiniAppValidationResult,
  toFlowJson,
  validateMiniApp,
} from "@chatbotx.io/mini-app"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { copyNamePrefix, insertWithFreeCopyName } from "../lib/copy-name"
import {
  buildNewDefinition,
  buildUpdatedDefinition,
  type MiniAppDefinitionInput,
} from "./definition"
import { MINI_APP_COPY_NAME, NAME_TAKEN, rethrowNameTaken } from "./names"

export { importMiniAppFlowJson } from "./definition"

type MiniAppScope = { workspaceId: string; id: string }

class MiniAppService extends BaseService {
  async list(input: MiniAppListInput) {
    const [data, totalRows] = await Promise.all([
      miniAppRepository.listPaginated(input),
      miniAppRepository.count(input),
    ])
    return { data, pageCount: Math.ceil(totalRows / input.perPage) }
  }

  async findOrFail(scope: MiniAppScope) {
    const miniApp = await miniAppRepository.findByIdAndWorkspace(scope)
    if (!miniApp) {
      throw notFoundException("Mini App not found")
    }
    return miniApp
  }

  async findUnscoped(id: string): Promise<MiniAppModel | null> {
    return (await miniAppRepository.findById(id)) ?? null
  }

  validate(definition: unknown): MiniAppValidationResult {
    return validateMiniApp(definition)
  }

  /** Inserts a Mini App with its Flow JSON generated from the definition. */
  private async insert(values: {
    workspaceId: string
    name: string
    enabled: boolean
    definition: MiniAppDefinition
  }): Promise<MiniAppModel> {
    const [created] = await db
      .insert(miniAppModel)
      .values({
        id: createId(),
        ...values,
        flowJson: toFlowJson(values.definition),
        submissionsCount: 0,
      })
      .returning()
    return created as MiniAppModel
  }

  /** Creates a Mini App from an editor definition or Meta Flow JSON. */
  async create(
    input: { workspaceId: string; name: string } & MiniAppDefinitionInput,
  ): Promise<MiniAppModel> {
    const definition = buildNewDefinition(input)
    try {
      return await this.insert({
        workspaceId: input.workspaceId,
        name: input.name,
        enabled: true,
        definition,
      })
    } catch (error) {
      return rethrowNameTaken(error)
    }
  }

  /**
   * Copies a Mini App's screens and custom field mappings into a new Mini App
   * named `<name> - Copy` (then `- Copy 2`, `- Copy 3`, … while taken).
   * Submissions and WhatsApp publications stay with the original.
   */
  async duplicate(scope: MiniAppScope): Promise<MiniAppModel> {
    const source = await this.findOrFail(scope)
    const taken = new Set(
      await miniAppRepository.listNamesWithPrefix({
        workspaceId: scope.workspaceId,
        prefix: copyNamePrefix(source.name, MINI_APP_COPY_NAME),
      }),
    )
    const copy = await insertWithFreeCopyName({
      constraint: "MiniApp_workspaceId_name_key",
      base: source.name,
      taken,
      options: MINI_APP_COPY_NAME,
      insert: (name) =>
        this.insert({
          workspaceId: scope.workspaceId,
          name,
          enabled: source.enabled,
          definition: source.definition,
        }),
    })
    if (copy) {
      return copy
    }
    throw validationException("name", NAME_TAKEN)
  }

  /**
   * Changes the name, enabled state and/or screens. New screens come from the
   * editor's `definition` or from Meta `flowJson`; see `buildUpdatedDefinition`
   * for how custom field mappings are kept.
   */
  async update(
    scope: MiniAppScope,
    data: { name?: string; enabled?: boolean } & MiniAppDefinitionInput,
  ): Promise<MiniAppModel> {
    const miniApp = await this.findOrFail(scope)
    const definition = buildUpdatedDefinition(miniApp.definition, data)
    const changes = {
      ...(data.name === undefined ? {} : { name: data.name }),
      ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
      ...(definition ? { definition, flowJson: toFlowJson(definition) } : {}),
    }
    if (Object.keys(changes).length === 0) {
      return miniApp
    }
    try {
      const [updated] = await db
        .update(miniAppModel)
        .set(changes)
        .where(
          and(
            eq(miniAppModel.id, miniApp.id),
            eq(miniAppModel.workspaceId, scope.workspaceId),
          ),
        )
        .returning()
      return updated as MiniAppModel
    } catch (error) {
      return rethrowNameTaken(error)
    }
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<number> {
    if (input.ids.length === 0) {
      return 0
    }
    const deleted = await db
      .delete(miniAppModel)
      .where(
        and(
          eq(miniAppModel.workspaceId, input.workspaceId),
          inArray(miniAppModel.id, input.ids),
        ),
      )
      .returning({ id: miniAppModel.id })
    return deleted.length
  }
}

export const miniAppService = new MiniAppService()
