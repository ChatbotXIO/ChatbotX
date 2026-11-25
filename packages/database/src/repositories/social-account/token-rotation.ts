import { and, asc, type DatabaseClient, db, eq, sql } from "../../client"
import { socialAccountDestinationModel, socialAccountModel } from "../../schema"
import type { SocialTokenWrite } from "./repository"

/** Token reads and compare-and-swap writes for the encryption-key rotation only. */
export const socialAccountTokenRotationRepository = {
  /** Accounts after `afterId` with their encrypted tokens, for the key rotation only. */
  async listTokenRowsAfter(
    input: { afterId: string | null; limit: number },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        accessToken: socialAccountModel.accessToken,
        id: socialAccountModel.id,
        refreshToken: socialAccountModel.refreshToken,
        workspaceId: socialAccountModel.workspaceId,
      })
      .from(socialAccountModel)
      .where(
        input.afterId === null
          ? undefined
          : sql`${socialAccountModel.id} > ${input.afterId}::bigint`,
      )
      .orderBy(asc(socialAccountModel.id))
      .limit(input.limit)
  },

  /** Destinations after `afterId` with their encrypted tokens, for the key rotation only. */
  async listDestinationTokenRowsAfter(
    input: { afterId: string | null; limit: number },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        accessToken: socialAccountDestinationModel.accessToken,
        id: socialAccountDestinationModel.id,
        workspaceId: socialAccountDestinationModel.workspaceId,
      })
      .from(socialAccountDestinationModel)
      .where(
        input.afterId === null
          ? undefined
          : sql`${socialAccountDestinationModel.id} > ${input.afterId}::bigint`,
      )
      .orderBy(asc(socialAccountDestinationModel.id))
      .limit(input.limit)
  },

  /**
   * Replaces an account's token ciphertexts only while they are still the ones
   * that were read, so a newer write (a reconnect, a refresh) is never lost.
   */
  async replaceAccountTokenCiphertext(
    input: {
      accessToken: SocialTokenWrite
      expectedAccessToken: SocialTokenWrite
      expectedRefreshToken: SocialTokenWrite
      id: string
      refreshToken: SocialTokenWrite
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const asJson = (value: SocialTokenWrite) =>
      value === null ? null : JSON.stringify(value)
    const rows = await tx
      .update(socialAccountModel)
      .set({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
      })
      .where(
        and(
          eq(socialAccountModel.id, input.id),
          sql`${socialAccountModel.accessToken} IS NOT DISTINCT FROM ${asJson(input.expectedAccessToken)}::jsonb`,
          sql`${socialAccountModel.refreshToken} IS NOT DISTINCT FROM ${asJson(input.expectedRefreshToken)}::jsonb`,
        ),
      )
      .returning({ id: socialAccountModel.id })
    return rows.length > 0
  },

  /** The destination counterpart of `replaceAccountTokenCiphertext`. */
  async replaceDestinationTokenCiphertext(
    input: {
      accessToken: SocialTokenWrite
      expectedAccessToken: SocialTokenWrite
      id: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const asJson = (value: SocialTokenWrite) =>
      value === null ? null : JSON.stringify(value)
    const rows = await tx
      .update(socialAccountDestinationModel)
      .set({ accessToken: input.accessToken })
      .where(
        and(
          eq(socialAccountDestinationModel.id, input.id),
          sql`${socialAccountDestinationModel.accessToken} IS NOT DISTINCT FROM ${asJson(input.expectedAccessToken)}::jsonb`,
        ),
      )
      .returning({ id: socialAccountDestinationModel.id })
    return rows.length > 0
  },
}
