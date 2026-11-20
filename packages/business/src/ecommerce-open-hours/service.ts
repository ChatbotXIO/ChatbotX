import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type OpenHoursSchedule,
  openHoursScheduleSchema,
} from "@chatbotx.io/database/partials"
import { ecommerceOpenHoursRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import {
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"

/**
 * Named open-hours schedules. The store settings and each vendor point at one;
 * deleting a schedule makes them always open again (`SET NULL`).
 */
class EcommerceOpenHoursService extends BaseService {
  async list(workspaceId: string) {
    return await ecommerceOpenHoursRepository.list(workspaceId)
  }

  /**
   * The insert core (shape rules plus the row write), shared with the template
   * install so there is one implementation.
   */
  async insertInTx(
    tx: DatabaseClient,
    input: OpenHoursSchedule & { workspaceId: string },
  ) {
    const schedule = openHoursScheduleSchema.parse(input)
    const row = await ecommerceOpenHoursRepository.create(
      { workspaceId: input.workspaceId, ...schedule },
      tx,
    )
    if (!row) {
      throw new Error("Failed to create the open-hours schedule")
    }
    return row
  }

  async create(input: OpenHoursSchedule & { workspaceId: string }) {
    const row = await this.insertInTx(db, input)
    await this.invalidate(input.workspaceId)
    return row
  }

  async update(input: {
    workspaceId: string
    openHoursId: string
    data: Partial<OpenHoursSchedule>
  }) {
    const values = openHoursScheduleSchema.partial().parse(input.data)
    const row = await withTemplateLockedTransaction(
      async (tx) => {
        const current = await ecommerceOpenHoursRepository.find(input, tx)
        if (!current) {
          throw notFoundException("Open-hours schedule not found")
        }
        await assertResourceEditable({
          workspaceId: input.workspaceId,
          resourceKind: "openHours",
          resourceIds: [current.id],
          changedKeys: changedKeysOf(current, values),
          tx,
        })
        return await ecommerceOpenHoursRepository.update(
          {
            workspaceId: input.workspaceId,
            openHoursId: input.openHoursId,
            values,
          },
          tx,
        )
      },
      {
        workspaceId: input.workspaceId,
        initialKeys: [{ kind: "openHours", resourceId: input.openHoursId }],
      },
    )
    if (!row) {
      throw notFoundException("Open-hours schedule not found")
    }
    await this.invalidate(input.workspaceId)
    return row
  }

  async delete(input: { workspaceId: string; openHoursId: string }) {
    const deleted = await withDeleteGuard(
      {
        workspaceId: input.workspaceId,
        targets: [
          { resourceKind: "openHours", resourceIds: [input.openHoursId] },
        ],
      },
      (tx) =>
        this.deleteInTx(tx, {
          workspaceId: input.workspaceId,
          ids: [input.openHoursId],
        }),
    )
    if (deleted.length === 0) {
      throw notFoundException("Open-hours schedule not found")
    }
    await this.invalidate(input.workspaceId)
  }

  /**
   * The delete core (row write only), shared with the template uninstall. The
   * store settings and vendors that pointed at it become always open again
   * (`SET NULL`). The caller drops the cache after the commit.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ): Promise<string[]> {
    return await ecommerceOpenHoursRepository.deleteManyReturningIds(input, tx)
  }

  /** The cache drop a delete leaves for after its commit; the template uninstall runs it too. */
  async invalidateWorkspaceCache(workspaceId: string): Promise<void> {
    await this.invalidate(workspaceId)
  }

  /** Throws unless the schedule exists in this workspace. */
  async assertBelongsToWorkspace(input: {
    workspaceId: string
    openHoursId: string
    tx?: DatabaseClient
  }) {
    const row = await ecommerceOpenHoursRepository.find(
      { workspaceId: input.workspaceId, openHoursId: input.openHoursId },
      input.tx,
    )
    if (!row) {
      throw notFoundException("Open-hours schedule does not exist.")
    }
    return row
  }

  // Settings embed nothing from the schedule, but a cached settings read is
  // dropped too so a deleted schedule never lingers as the store's choice.
  private invalidate(workspaceId: string) {
    return this.invalidateCacheTags([
      `ecommerce-open-hours:${workspaceId}`,
      `ecommerce-settings:${workspaceId}`,
    ])
  }
}

export const ecommerceOpenHoursService = new EcommerceOpenHoursService()
