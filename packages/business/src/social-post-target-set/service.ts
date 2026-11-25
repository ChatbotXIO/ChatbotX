import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import {
  socialPostRepository,
  socialPostTargetSetRepository,
} from "@chatbotx.io/database/repositories"
import type { PublishDestinationState } from "@chatbotx.io/utils/publish-destination"
import { BaseService } from "../base.service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"
import { mapDestinationScopeError } from "../publish-destination/errors"

/** Most sets one workspace may keep; bounds the picker and the list. */
export const MAX_POST_TARGET_SETS_PER_WORKSPACE = 50
/** Most destinations one set may list. */
export const MAX_DESTINATIONS_PER_TARGET_SET = 30

const SET_NAME_UNIQUE_INDEX = "SocialPostTargetSet_workspaceId_name_key"

export type PostTargetSetItem = {
  /** `state` is the destination's publish state; only `ready` takes a post. */
  destinations: { id: string; state: PublishDestinationState }[]
  id: string
  name: string
}

const nameTakenException = () =>
  conflictException(
    "A set with this name already exists.",
    "targetSetNameTaken",
  )

class SocialPostTargetSetService extends BaseService {
  /** Every id belongs to the workspace, once each, within the cap. */
  private async assertDestinations(
    workspaceId: string,
    destinationIds: string[],
  ): Promise<void> {
    if (
      new Set(destinationIds).size !== destinationIds.length ||
      destinationIds.length > MAX_DESTINATIONS_PER_TARGET_SET
    ) {
      throw validationException(
        "destinationIds",
        `Give each destination once, at most ${MAX_DESTINATIONS_PER_TARGET_SET}.`,
      )
    }
    const found = await socialPostRepository.findDestinations({
      ids: destinationIds,
      workspaceId,
    })
    if (found.length !== destinationIds.length) {
      throw validationException(
        "destinationIds",
        "A destination was not found.",
      )
    }
  }

  /** Sets with each destination's current state; a set never lists a foreign id. */
  private async hydrate(
    workspaceId: string,
    sets: { id: string; name: string }[],
  ): Promise<PostTargetSetItem[]> {
    const links = await socialPostTargetSetRepository.listDestinations({
      targetSetIds: sets.map((set) => set.id),
      workspaceId,
    })
    const rows = await socialPostRepository.findDestinations({
      ids: [...new Set(links.map((link) => link.destinationId))],
      workspaceId,
    })
    const byId = new Map(rows.map((row) => [row.id, row]))
    return sets.map((set) => ({
      destinations: links
        .filter((link) => link.targetSetId === set.id)
        .flatMap((link) => {
          const row = byId.get(link.destinationId)
          return row ? [{ id: row.id, state: row.state }] : []
        }),
      id: set.id,
      name: set.name,
    }))
  }

  async list(input: {
    workspaceId: string
  }): Promise<{ items: PostTargetSetItem[] }> {
    const sets = await socialPostTargetSetRepository.list({
      limit: MAX_POST_TARGET_SETS_PER_WORKSPACE,
      workspaceId: input.workspaceId,
    })
    return { items: await this.hydrate(input.workspaceId, sets) }
  }

  async get(input: {
    id: string
    workspaceId: string
  }): Promise<PostTargetSetItem> {
    const set = await socialPostTargetSetRepository.findById(input)
    if (!set) {
      throw notFoundException("Set not found.")
    }
    const [item] = await this.hydrate(input.workspaceId, [set])
    return item as PostTargetSetItem
  }

  async create(input: {
    destinationIds: string[]
    name: string
    workspaceId: string
  }): Promise<PostTargetSetItem> {
    await this.assertDestinations(input.workspaceId, input.destinationIds)
    const created = await this.createInTransaction(input)
    return await this.get({ id: created.id, workspaceId: input.workspaceId })
  }

  private async createInTransaction(input: {
    destinationIds: string[]
    name: string
    workspaceId: string
  }): Promise<{ id: string }> {
    try {
      return await this.insertWithDestinations(input)
    } catch (err) {
      throw mapDestinationScopeError(err)
    }
  }

  private async insertWithDestinations(input: {
    destinationIds: string[]
    name: string
    workspaceId: string
  }): Promise<{ id: string }> {
    return await db.transaction(async (tx) => {
      await socialPostTargetSetRepository.lockWorkspaceSets(
        input.workspaceId,
        tx,
      )
      const count = await socialPostTargetSetRepository.countByWorkspace(
        input.workspaceId,
        tx,
      )
      if (count >= MAX_POST_TARGET_SETS_PER_WORKSPACE) {
        throw validationException(
          "name",
          `A workspace can have at most ${MAX_POST_TARGET_SETS_PER_WORKSPACE} sets.`,
        )
      }
      const set = await socialPostTargetSetRepository.insert(
        { name: input.name, workspaceId: input.workspaceId },
        tx,
      )
      if (!set) {
        throw nameTakenException()
      }
      await socialPostTargetSetRepository.replaceDestinations(
        {
          destinationIds: input.destinationIds,
          targetSetId: set.id,
          workspaceId: input.workspaceId,
        },
        tx,
      )
      return set
    })
  }

  async update(input: {
    destinationIds?: string[]
    id: string
    name?: string
    workspaceId: string
  }): Promise<PostTargetSetItem> {
    const { destinationIds, id, name, workspaceId } = input
    if (destinationIds) {
      await this.assertDestinations(workspaceId, destinationIds)
    }
    try {
      await db.transaction(async (tx) => {
        const current = await socialPostTargetSetRepository.findById(
          { id, workspaceId },
          tx,
        )
        if (!current) {
          throw notFoundException("Set not found.")
        }
        if (name !== undefined) {
          await socialPostTargetSetRepository.rename(
            { id, name, workspaceId },
            tx,
          )
        }
        if (destinationIds) {
          await socialPostTargetSetRepository.replaceDestinations(
            { destinationIds, targetSetId: id, workspaceId },
            tx,
          )
        }
      })
    } catch (err) {
      if (isUniqueViolationError(err, SET_NAME_UNIQUE_INDEX)) {
        throw nameTakenException()
      }
      throw mapDestinationScopeError(err)
    }
    return await this.get({ id, workspaceId })
  }

  async delete(input: { id: string; workspaceId: string }): Promise<void> {
    const deleted = await socialPostTargetSetRepository.delete(input)
    if (!deleted) {
      throw notFoundException("Set not found.")
    }
  }
}

export const socialPostTargetSetService = new SocialPostTargetSetService()
