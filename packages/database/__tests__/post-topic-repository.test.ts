import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { postTopicRepository } from "../src/repositories/post-topic/repository"
import {
  channelPostToPostTopicModel,
  postTopicModel,
} from "../src/schema/post-topic"

const dialect = new PgDialect()

const deleteTx = () => {
  const where = vi.fn().mockResolvedValue(undefined)
  const deleteFrom = vi.fn().mockReturnValue({ where })
  return {
    deleteFrom,
    tx: { delete: deleteFrom } as unknown as DatabaseClient,
    where,
  }
}

const insertTx = (returned: unknown[] = []) => {
  const returning = vi.fn().mockResolvedValue(returned)
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning })
  const values = vi.fn().mockReturnValue({ onConflictDoNothing })
  const insert = vi.fn().mockReturnValue({ values })
  return {
    insert,
    onConflictDoNothing,
    tx: { insert } as unknown as DatabaseClient,
    values,
  }
}

describe("postTopicRepository.addToPosts", () => {
  test("inserts every post x topic pair and ignores pairs that already exist", async () => {
    const { insert, onConflictDoNothing, tx, values } = insertTx()
    onConflictDoNothing.mockResolvedValue(undefined)

    await postTopicRepository.addToPosts(
      { channelPostIds: ["1", "2"], topicIds: ["7", "8"] },
      tx,
    )

    expect(insert).toHaveBeenCalledWith(channelPostToPostTopicModel)
    expect(values).toHaveBeenCalledWith([
      { channelPostId: "1", postTopicId: "7" },
      { channelPostId: "1", postTopicId: "8" },
      { channelPostId: "2", postTopicId: "7" },
      { channelPostId: "2", postTopicId: "8" },
    ])
    expect(onConflictDoNothing).toHaveBeenCalled()
  })

  test("does nothing without topics", async () => {
    const { insert, tx } = insertTx()

    await postTopicRepository.addToPosts(
      { channelPostIds: ["1"], topicIds: [] },
      tx,
    )

    expect(insert).not.toHaveBeenCalled()
  })
})

describe("postTopicRepository.replaceForPosts", () => {
  test("deletes the topics that are not in the new set, then adds the new set", async () => {
    const del = deleteTx()
    const ins = insertTx()
    ins.onConflictDoNothing.mockResolvedValue(undefined)
    const tx = { ...del.tx, ...ins.tx } as unknown as DatabaseClient

    await postTopicRepository.replaceForPosts(
      { channelPostIds: ["1"], topicIds: ["7"] },
      tx,
    )

    const condition = dialect.sqlToQuery(del.where.mock.calls[0][0])
    expect(condition.sql).toContain(
      '"ChannelPostToPostTopic"."channelPostId" in ($1)',
    )
    expect(condition.sql).toContain(
      '"ChannelPostToPostTopic"."postTopicId" not in ($2)',
    )
    expect(condition.params).toEqual(["1", "7"])
    expect(ins.values).toHaveBeenCalledWith([
      { channelPostId: "1", postTopicId: "7" },
    ])
  })

  test("an empty set removes every topic of the posts and adds nothing", async () => {
    const del = deleteTx()
    const ins = insertTx()
    const tx = { ...del.tx, ...ins.tx } as unknown as DatabaseClient

    await postTopicRepository.replaceForPosts(
      { channelPostIds: ["1"], topicIds: [] },
      tx,
    )

    const condition = dialect.sqlToQuery(del.where.mock.calls[0][0])
    expect(condition.sql).not.toContain("not in")
    expect(ins.insert).not.toHaveBeenCalled()
  })
})

describe("postTopicRepository.removeFromPosts", () => {
  test("removes only the named topics from the named posts", async () => {
    const { tx, where } = deleteTx()

    await postTopicRepository.removeFromPosts(
      { channelPostIds: ["1", "2"], topicIds: ["7"] },
      tx,
    )

    const condition = dialect.sqlToQuery(where.mock.calls[0][0])
    expect(condition.sql).toContain('"channelPostId" in ($1, $2)')
    expect(condition.sql).toContain('"postTopicId" in ($3)')
  })

  test("does nothing without topics", async () => {
    const { deleteFrom, tx } = deleteTx()

    await postTopicRepository.removeFromPosts(
      { channelPostIds: ["1"], topicIds: [] },
      tx,
    )

    expect(deleteFrom).not.toHaveBeenCalled()
  })
})

describe("postTopicRepository.insert", () => {
  test("returns null when the name is already taken in the workspace", async () => {
    const { onConflictDoNothing, tx, values } = insertTx([])

    const created = await postTopicRepository.insert(
      { color: null, name: "Sale", workspaceId: "ws-1" },
      tx,
    )

    expect(created).toBeNull()
    expect(values).toHaveBeenCalledWith({
      color: null,
      name: "Sale",
      workspaceId: "ws-1",
    })
    expect(onConflictDoNothing).toHaveBeenCalledWith({
      target: [postTopicModel.workspaceId, postTopicModel.name],
    })
  })

  test("returns the created topic", async () => {
    const topic = { color: null, id: "1", name: "Sale" }
    const { tx } = insertTx([topic])

    await expect(
      postTopicRepository.insert(
        { color: null, name: "Sale", workspaceId: "ws-1" },
        tx,
      ),
    ).resolves.toBe(topic)
  })
})

describe("postTopicRepository.findPostsOverTopicLimit", () => {
  test("groups by post and keeps those with more topics than the limit", async () => {
    const having = vi.fn().mockResolvedValue([{ channelPostId: "2" }])
    const groupBy = vi.fn().mockReturnValue({ having })
    const where = vi.fn().mockReturnValue({ groupBy })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })

    const ids = await postTopicRepository.findPostsOverTopicLimit(
      { channelPostIds: ["1", "2"], limit: 20 },
      { select } as unknown as DatabaseClient,
    )

    expect(ids).toEqual(["2"])
    const condition = dialect.sqlToQuery(having.mock.calls[0][0])
    expect(condition.sql).toContain("count(*) >")
    expect(condition.params).toEqual([20])
  })
})

describe("postTopicRepository.lockWorkspaceTopics", () => {
  test("takes a transaction-scoped advisory lock keyed by the workspace", async () => {
    const execute = vi.fn().mockResolvedValue(undefined)

    await postTopicRepository.lockWorkspaceTopics("ws-1", {
      execute,
    } as unknown as DatabaseClient)

    const query = dialect.sqlToQuery(execute.mock.calls[0][0])
    expect(query.sql).toContain("pg_advisory_xact_lock")
    expect(query.sql).toContain("'post-topics:'")
    expect(query.params).toEqual(["ws-1"])
  })
})

describe("postTopicRepository.findExistingIds", () => {
  test("skips the query for an empty id list", async () => {
    const select = vi.fn()

    const ids = await postTopicRepository.findExistingIds(
      { ids: [], workspaceId: "ws-1" },
      { select } as unknown as DatabaseClient,
    )

    expect(ids).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })
})
