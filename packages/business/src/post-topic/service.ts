import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import { postTopicRepository } from "@chatbotx.io/database/repositories"
import { BaseService } from "../base.service"
import {
  conflictException,
  notFoundException,
  validationException,
} from "../errors"

/** Most topics one workspace may define; bounds the picker and the list. */
export const MAX_POST_TOPICS_PER_WORKSPACE = 200

const TOPIC_NAME_UNIQUE_INDEX = "PostTopic_workspaceId_name_key"

export type PostTopicItem = {
  color: string | null
  id: string
  name: string
}

const nameTakenException = () =>
  conflictException("A topic with this name already exists.", "topicNameTaken")

class PostTopicService extends BaseService {
  async list(input: {
    search?: string
    workspaceId: string
  }): Promise<{ items: PostTopicItem[] }> {
    return {
      items: await postTopicRepository.list({
        ...input,
        limit: MAX_POST_TOPICS_PER_WORKSPACE,
      }),
    }
  }

  async create(input: {
    color?: string | null
    name: string
    workspaceId: string
  }): Promise<PostTopicItem> {
    // The cap is checked and the row inserted under one workspace lock, so
    // concurrent creates cannot overshoot it and strand topics past the 200
    // the list can return.
    return await db.transaction(async (tx) => {
      await postTopicRepository.lockWorkspaceTopics(input.workspaceId, tx)
      const count = await postTopicRepository.countByWorkspace(
        input.workspaceId,
        tx,
      )
      if (count >= MAX_POST_TOPICS_PER_WORKSPACE) {
        throw validationException(
          "name",
          `A workspace can have at most ${MAX_POST_TOPICS_PER_WORKSPACE} topics.`,
        )
      }

      const created = await postTopicRepository.insert(
        {
          color: input.color ?? null,
          name: input.name,
          workspaceId: input.workspaceId,
        },
        tx,
      )
      if (!created) {
        throw nameTakenException()
      }
      return created
    })
  }

  async update(input: {
    color?: string | null
    id: string
    name?: string
    workspaceId: string
  }): Promise<PostTopicItem> {
    try {
      const updated = await postTopicRepository.update(input)
      if (!updated) {
        throw notFoundException("Topic not found.")
      }
      return updated
    } catch (err) {
      if (isUniqueViolationError(err, TOPIC_NAME_UNIQUE_INDEX)) {
        throw nameTakenException()
      }
      throw err
    }
  }

  async delete(input: { id: string; workspaceId: string }): Promise<void> {
    const deleted = await postTopicRepository.delete(input)
    if (!deleted) {
      throw notFoundException("Topic not found.")
    }
  }
}

export const postTopicService = new PostTopicService()
