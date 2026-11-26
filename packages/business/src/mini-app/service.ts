import { and, type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  type MiniAppListInput,
  miniAppRepository,
} from "@chatbotx.io/database/repositories"
import { miniAppModel } from "@chatbotx.io/database/schema"
import type { MiniAppModel } from "@chatbotx.io/database/types"
import { deleteByIdsInWorkspace } from "@chatbotx.io/database/utils"
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
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
import {
  buildNewDefinition,
  buildUpdatedDefinition,
  type MiniAppDefinitionInput,
} from "./definition"
import { MINI_APP_COPY_NAME, NAME_TAKEN, rethrowNameTaken } from "./names"
import { miniAppPublicationService } from "./publication-service"

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

  /**
   * Refuses to start a Meta publish for a Mini App that is gone or being
   * uninstalled. Best effort (the lock is released on return): the
   * authoritative check is `recordPublication`, after Meta answered.
   */
  async assertAcceptsPublication(scope: MiniAppScope): Promise<void> {
    await this.lockedPublicationCheck(scope, async () => undefined)
  }

  /**
   * Records a publication under the Mini App's template lock, re-checking that
   * it still exists and is not being uninstalled (the uninstall keeps only a
   * Mini App that already has a publication). Throws otherwise, so the caller
   * can undo what it created on Meta.
   */
  async recordPublication(
    scope: MiniAppScope,
    input: Omit<
      Parameters<typeof miniAppPublicationService.record>[0],
      "miniAppId"
    >,
  ) {
    return await this.lockedPublicationCheck(scope, (tx) =>
      miniAppPublicationService.record({ ...input, miniAppId: scope.id }, tx),
    )
  }

  private async lockedPublicationCheck<T>(
    scope: MiniAppScope,
    run: (tx: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    return await withTemplateLockedTransaction(
      async (tx) => {
        const miniApp = await tx.query.miniAppModel.findFirst({
          where: { id: scope.id, workspaceId: scope.workspaceId },
        })
        if (!miniApp) {
          throw notFoundException("Mini App not found")
        }
        // No content key changes: this only takes the lock and refuses a
        // tombstoned (being uninstalled) copy.
        await assertResourceEditable({
          workspaceId: scope.workspaceId,
          resourceKind: "miniApp",
          resourceIds: [miniApp.id],
          changedKeys: [],
          tx,
        })
        return await run(tx)
      },
      {
        workspaceId: scope.workspaceId,
        initialKeys: [{ kind: "miniApp", resourceId: scope.id }],
      },
    )
  }

  async findUnscoped(id: string): Promise<MiniAppModel | null> {
    return (await miniAppRepository.findById(id)) ?? null
  }

  validate(definition: unknown): MiniAppValidationResult {
    return validateMiniApp(definition)
  }

  /**
   * Inserts a Mini App with its Flow JSON generated from the definition. The
   * row write shared by `create`, `duplicate` and the template install.
   */
  async insertInTx(
    tx: DatabaseClient,
    values: {
      workspaceId: string
      name: string
      enabled: boolean
      definition: MiniAppDefinition
    },
  ): Promise<MiniAppModel> {
    const [created] = await tx
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
      return await this.insertInTx(db, {
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
    const copy = await withTemplateLockedTransaction(
      async (tx) => {
        const source = await tx.query.miniAppModel.findFirst({
          where: { id: scope.id, workspaceId: scope.workspaceId },
        })
        if (!source) {
          throw notFoundException("Mini App not found")
        }
        // Takes the source's lock and refuses one that is being uninstalled,
        // so the copy cannot land after the uninstall decided what to keep.
        await assertResourceEditable({
          workspaceId: scope.workspaceId,
          resourceKind: "miniApp",
          resourceIds: [source.id],
          changedKeys: [],
          tx,
        })
        const taken = new Set(
          await miniAppRepository.listNamesWithPrefix(
            {
              workspaceId: scope.workspaceId,
              prefix: copyNamePrefix(source.name, MINI_APP_COPY_NAME),
            },
            tx,
          ),
        )
        // A savepoint per candidate: a name taken by a concurrent copy must
        // not abort the transaction.
        return await insertWithFreeCopyName({
          constraint: "MiniApp_workspaceId_name_key",
          base: source.name,
          taken,
          options: MINI_APP_COPY_NAME,
          insert: (name) =>
            tx.transaction((savepoint) =>
              this.insertInTx(savepoint, {
                workspaceId: scope.workspaceId,
                name,
                enabled: source.enabled,
                definition: source.definition,
              }),
            ),
        })
      },
      {
        workspaceId: scope.workspaceId,
        initialKeys: [{ kind: "miniApp", resourceId: scope.id }],
      },
    )
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
    try {
      // The row is locked before it is read, so the diff that decides the
      // View-only guard is computed under the lock.
      return await withTemplateLockedTransaction(
        async (tx) => {
          const miniApp = await tx.query.miniAppModel.findFirst({
            where: { id: scope.id, workspaceId: scope.workspaceId },
          })
          if (!miniApp) {
            throw notFoundException("Mini App not found")
          }
          const definition = buildUpdatedDefinition(miniApp.definition, data)
          const changes = {
            ...(data.name === undefined ? {} : { name: data.name }),
            ...(data.enabled === undefined ? {} : { enabled: data.enabled }),
            ...(definition
              ? { definition, flowJson: toFlowJson(definition) }
              : {}),
          }
          if (Object.keys(changes).length === 0) {
            return miniApp
          }
          await assertResourceEditable({
            workspaceId: scope.workspaceId,
            resourceKind: "miniApp",
            resourceIds: [miniApp.id],
            changedKeys: changedKeysOf(miniApp, {
              name: changes.name,
              definition: changes.definition,
            }),
            tx,
          })
          const [updated] = await tx
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
        },
        {
          workspaceId: scope.workspaceId,
          initialKeys: [{ kind: "miniApp", resourceId: scope.id }],
        },
      )
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
    const deleted = await withDeleteGuard(
      {
        workspaceId: input.workspaceId,
        targets: [{ resourceKind: "miniApp", resourceIds: input.ids }],
      },
      (tx) => this.deleteInTx(tx, input),
    )
    return deleted.length
  }

  /**
   * The delete core (row write only; submissions, uploads and publications
   * cascade), shared with the template uninstall so there is one
   * implementation. Returns the ids deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<string[]> {
    return await deleteByIdsInWorkspace(tx, miniAppModel, input)
  }
}

export const miniAppService = new MiniAppService()
