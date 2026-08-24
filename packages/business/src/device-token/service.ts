import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
} from "@chatbotx.io/database/client"
import type { DevicePlatformType } from "@chatbotx.io/database/partials"
import { userDeviceTokenModel } from "@chatbotx.io/database/schema"
import type { UserDeviceTokenModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"

class DeviceTokenService extends BaseService {
  async upsert(props: {
    tx?: DatabaseClient
    userId: string
    workspaceId?: string | null
    platform: DevicePlatformType
    token: string
  }): Promise<UserDeviceTokenModel> {
    const { tx = db, userId, workspaceId, platform, token } = props
    const now = new Date()
    const [row] = await tx
      .insert(userDeviceTokenModel)
      .values({ userId, workspaceId, platform, token, lastSeenAt: now })
      .onConflictDoUpdate({
        target: [userDeviceTokenModel.token],
        set: { userId, workspaceId, platform, lastSeenAt: now },
      })
      .returning()
    return row
  }

  async deleteByToken(props: {
    tx?: DatabaseClient
    userId: string
    token: string
  }): Promise<void> {
    const { tx = db, userId, token } = props
    await tx
      .delete(userDeviceTokenModel)
      .where(
        and(
          eq(userDeviceTokenModel.token, token),
          eq(userDeviceTokenModel.userId, userId),
        ),
      )
  }

  /** Prunes tokens rejected by Expo (e.g. DeviceNotRegistered), plus invalid-format tokens. */
  async deleteByTokens(props: {
    tx?: DatabaseClient
    tokens: string[]
  }): Promise<void> {
    const { tx = db, tokens } = props
    if (tokens.length === 0) {
      return
    }
    await tx
      .delete(userDeviceTokenModel)
      .where(inArray(userDeviceTokenModel.token, tokens))
  }

  async findByUserIds(props: {
    tx?: DatabaseClient
    userIds: string[]
  }): Promise<UserDeviceTokenModel[]> {
    const { tx = db, userIds } = props
    if (userIds.length === 0) {
      return []
    }
    return await tx.query.userDeviceTokenModel.findMany({
      where: { userId: { in: userIds } },
    })
  }
}

export const deviceTokenService = new DeviceTokenService()
