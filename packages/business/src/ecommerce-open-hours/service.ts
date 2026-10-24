import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  type OpenHoursSchedule,
  openHoursScheduleSchema,
} from "@chatbotx.io/database/partials"
import { ecommerceOpenHoursRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

/**
 * Named open-hours schedules. The store settings and each vendor point at one;
 * deleting a schedule makes them always open again (`SET NULL`).
 */
class EcommerceOpenHoursService extends BaseService {
  async list(workspaceId: string) {
    return await ecommerceOpenHoursRepository.list(workspaceId)
  }

  async create(input: OpenHoursSchedule & { workspaceId: string }) {
    const schedule = openHoursScheduleSchema.parse(input)
    const row = await ecommerceOpenHoursRepository.create({
      workspaceId: input.workspaceId,
      ...schedule,
    })
    if (!row) {
      throw new Error("Failed to create the open-hours schedule")
    }
    await this.invalidate(input.workspaceId)
    return row
  }

  async update(input: {
    workspaceId: string
    openHoursId: string
    data: Partial<OpenHoursSchedule>
  }) {
    const values = openHoursScheduleSchema.partial().parse(input.data)
    const row = await ecommerceOpenHoursRepository.update({
      workspaceId: input.workspaceId,
      openHoursId: input.openHoursId,
      values,
    })
    if (!row) {
      throw notFoundException("Open-hours schedule not found")
    }
    await this.invalidate(input.workspaceId)
    return row
  }

  async delete(input: { workspaceId: string; openHoursId: string }) {
    const row = await ecommerceOpenHoursRepository.delete(input)
    if (!row) {
      throw notFoundException("Open-hours schedule not found")
    }
    await this.invalidate(input.workspaceId)
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
