import { and, eq, inArray } from "drizzle-orm"
import { type DatabaseClient, db } from "../../client"
import type { MessengerPersistentMenu } from "../../partials/integration-messenger"
import { userPersistentMenuModel } from "../../schema"

export type UserPersistentMenuModel =
  typeof userPersistentMenuModel.$inferSelect

export function listUserPersistentMenusByWorkspace(
  params: { workspaceId: string },
  client: DatabaseClient = db,
): Promise<UserPersistentMenuModel[]> {
  return client.query.userPersistentMenuModel.findMany({
    where: {
      workspaceId: params.workspaceId,
    },
    orderBy: { createdAt: "desc" },
  })
}

export function findUserPersistentMenuById(
  params: { id: string; workspaceId: string },
  client: DatabaseClient = db,
): Promise<UserPersistentMenuModel | undefined> {
  return client.query.userPersistentMenuModel.findFirst({
    where: {
      id: params.id,
      workspaceId: params.workspaceId,
    },
  })
}

export function createUserPersistentMenu(
  params: {
    menus: MessengerPersistentMenu[]
    name: string
    workspaceId: string
  },
  client: DatabaseClient = db,
): Promise<UserPersistentMenuModel | undefined> {
  return client
    .insert(userPersistentMenuModel)
    .values({
      name: params.name,
      menus: params.menus,
      workspaceId: params.workspaceId,
    })
    .returning()
    .then((rows) => rows[0])
}

export function updateUserPersistentMenu(
  params: {
    id: string
    menus: MessengerPersistentMenu[]
    name: string
    workspaceId: string
  },
  client: DatabaseClient = db,
): Promise<UserPersistentMenuModel | undefined> {
  return client
    .update(userPersistentMenuModel)
    .set({
      name: params.name,
      menus: params.menus,
    })
    .where(
      and(
        eq(userPersistentMenuModel.id, params.id),
        eq(userPersistentMenuModel.workspaceId, params.workspaceId),
      ),
    )
    .returning()
    .then((rows) => rows[0])
}

export async function deleteUserPersistentMenus(
  params: { ids: string[]; workspaceId: string },
  client: DatabaseClient = db,
): Promise<void> {
  if (params.ids.length === 0) {
    return
  }
  await client
    .delete(userPersistentMenuModel)
    .where(
      and(
        inArray(userPersistentMenuModel.id, params.ids),
        eq(userPersistentMenuModel.workspaceId, params.workspaceId),
      ),
    )
}
