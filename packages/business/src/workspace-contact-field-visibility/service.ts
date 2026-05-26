import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import { workspaceContactFieldVisibilityModel } from "@chatbotx.io/database/schema"
import type { WorkspaceContactFieldVisibilityModel } from "@chatbotx.io/database/types"
import { invalidateCacheByTags, withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"

export type ContactFieldVisibility = "showAlways" | "alwaysHide"

export type ContactFieldVisibilityInput = {
  fieldKey: string
  visibility: ContactFieldVisibility
}

class WorkspaceContactFieldVisibilityService extends BaseService {
  protected readonly cachePrefix: string = "workspace-contact-field-visibility"

  /**
   * Lista as configurações de visibilidade gravadas no banco para o
   * workspace. Como o default é `showAlways`, só os hidden + os
   * explicitamente marcados ficam aqui.
   */
  async listByWorkspaceId(props: {
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<WorkspaceContactFieldVisibilityModel[]> {
    const { tx = db, workspaceId } = props
    const key = `workspaces:${workspaceId}:contact-field-visibility`

    return await withCache(
      key,
      async () =>
        await tx.query.workspaceContactFieldVisibilityModel.findMany({
          where: { workspaceId },
        }),
      {
        tags: [`workspaces:${workspaceId}#contact-field-visibility`],
      },
    )
  }

  /**
   * Retorna SÓ as `fieldKey`s marcadas como `alwaysHide`. Útil pro
   * drawer separar visíveis x ocultas.
   */
  async listHiddenFieldKeys(props: {
    tx?: DatabaseClient
    workspaceId: string
  }): Promise<string[]> {
    const all = await this.listByWorkspaceId(props)
    return all
      .filter((row) => row.visibility === "alwaysHide")
      .map((row) => row.fieldKey)
  }

  /**
   * Upsert em batch. Recebe a lista completa do estado desejado.
   * Items com `showAlways` são DELETADOS da tabela (já que é o
   * default — não precisa persistir). Items com `alwaysHide` são
   * inseridos/atualizados.
   */
  async setFieldsVisibility(props: {
    workspaceId: string
    items: ContactFieldVisibilityInput[]
  }): Promise<void> {
    const { workspaceId, items } = props

    const toHide = items.filter((i) => i.visibility === "alwaysHide")
    const toShow = items.filter((i) => i.visibility === "showAlways")

    await db.transaction(async (tx) => {
      // Upsert dos hidden
      if (toHide.length > 0) {
        await tx
          .insert(workspaceContactFieldVisibilityModel)
          .values(
            toHide.map((i) => ({
              id: createId(),
              workspaceId,
              fieldKey: i.fieldKey,
              visibility: i.visibility,
            })),
          )
          .onConflictDoUpdate({
            target: [
              workspaceContactFieldVisibilityModel.workspaceId,
              workspaceContactFieldVisibilityModel.fieldKey,
            ],
            set: {
              visibility: "alwaysHide",
            },
          })
      }

      // Delete dos que voltaram pra default (showAlways)
      // Itera porque o helper `inArray` precisaria de combinação composta
      // (workspaceId + fieldKey) — simples loop é mais legível.
      for (const item of toShow) {
        await tx
          .delete(workspaceContactFieldVisibilityModel)
          .where(
            eq(workspaceContactFieldVisibilityModel.fieldKey, item.fieldKey),
          )
      }
    })

    await invalidateCacheByTags([
      `workspaces:${workspaceId}#contact-field-visibility`,
    ])
  }
}

export const workspaceContactFieldVisibilityService =
  new WorkspaceContactFieldVisibilityService()
