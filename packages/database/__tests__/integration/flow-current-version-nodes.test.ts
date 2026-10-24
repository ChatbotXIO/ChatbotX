// @vitest-environment node

/**
 * Real-SQL checks for the flow node reads behind `flows.listNodes` and the
 * "Executed Step" labels: only the published version's nodes, scoped to the
 * workspace, and a flow never published has none.
 */

import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { Client } from "pg"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest"
import { relations } from "../../src/relations"
import { flowRepository } from "../../src/repositories/flow/repository"
// biome-ignore lint/performance/noNamespaceImport: mirrors the database client schema registration
import * as schema from "../../src/schema"
import { realDatabaseUrl } from "./database-url"

const databaseUrl = realDatabaseUrl()

const node = (id: string, name: string) => ({
  id,
  type: "sendMessage",
  data: { name },
})

describe.skipIf(!databaseUrl)("flow current version nodes (real SQL)", () => {
  let client: Client
  let workspaceId: string
  let otherWorkspaceId: string
  let userIds: string[]
  let publishedFlowId: string
  let draftOnlyFlowId: string
  let foreignFlowId: string

  const database = () => drizzle({ client, relations, schema })

  const createWorkspace = async (label: string) => {
    const db = database()
    const suffix = `${Date.now()}-${Math.random()}`
    const [user] = await db
      .insert(schema.userModel)
      .values({ email: `flow-nodes-${label}-${suffix}@example.test` })
      .returning({ id: schema.userModel.id })
    const [workspace] = await db
      .insert(schema.workspaceModel)
      .values({ name: `flow-nodes-${label}-${suffix}`, ownerId: user.id })
      .returning({ id: schema.workspaceModel.id })
    return { userId: user.id, workspaceId: workspace.id }
  }

  const createFlow = async (
    ownerWorkspaceId: string,
    name: string,
    versions: { nodes: ReturnType<typeof node>[]; publish: boolean }[],
  ) => {
    const db = database()
    const [flow] = await db
      .insert(schema.flowModel)
      .values({ name, workspaceId: ownerWorkspaceId })
      .returning({ id: schema.flowModel.id })
    let currentVersionId: string | undefined
    for (const version of versions) {
      const [created] = await db
        .insert(schema.flowVersionModel)
        .values({
          edges: [],
          flowId: flow.id,
          isDraft: !version.publish,
          isLatest: version.publish,
          nodes: version.nodes,
          startNodeId: version.nodes[0]?.id ?? "1",
          workspaceId: ownerWorkspaceId,
        })
        .returning({ id: schema.flowVersionModel.id })
      if (version.publish) {
        currentVersionId = created.id
      }
    }
    if (currentVersionId) {
      await db
        .update(schema.flowModel)
        .set({ currentVersionId })
        .where(eq(schema.flowModel.id, flow.id))
    }
    return flow.id
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl as string })
    await client.connect()
  })

  afterAll(async () => {
    await client?.end()
  })

  beforeEach(async () => {
    const own = await createWorkspace("own")
    const other = await createWorkspace("other")
    workspaceId = own.workspaceId
    otherWorkspaceId = other.workspaceId
    userIds = [own.userId, other.userId]
    publishedFlowId = await createFlow(workspaceId, "Published", [
      { nodes: [node("11", "Old start")], publish: true },
      { nodes: [node("21", "Draft only")], publish: false },
    ])
    draftOnlyFlowId = await createFlow(workspaceId, "Draft", [
      { nodes: [node("31", "Never published")], publish: false },
    ])
    foreignFlowId = await createFlow(otherWorkspaceId, "Foreign", [
      { nodes: [node("41", "Foreign node")], publish: true },
    ])
  })

  afterEach(async () => {
    const db = database()
    for (const id of [workspaceId, otherWorkspaceId]) {
      await db
        .delete(schema.workspaceModel)
        .where(eq(schema.workspaceModel.id, id))
    }
    for (const id of userIds) {
      await db.delete(schema.userModel).where(eq(schema.userModel.id, id))
    }
  })

  test("returns only the published version's nodes, not the draft's", async () => {
    const nodes = await flowRepository.findCurrentVersionNodes({
      workspaceId,
      flowId: publishedFlowId,
    })
    expect(nodes?.map((entry) => entry.id)).toEqual(["11"])
  })

  test("a flow that was never published has no nodes", async () => {
    expect(
      await flowRepository.findCurrentVersionNodes({
        workspaceId,
        flowId: draftOnlyFlowId,
      }),
    ).toEqual([])
  })

  test("another workspace's flow does not exist for this workspace", async () => {
    expect(
      await flowRepository.findCurrentVersionNodes({
        workspaceId,
        flowId: foreignFlowId,
      }),
    ).toBeUndefined()
  })

  test("reads the nodes of many flows in one scoped pass", async () => {
    const flows = await flowRepository.listCurrentVersionNodesByFlowIds({
      workspaceId,
      flowIds: [publishedFlowId, draftOnlyFlowId, foreignFlowId, "999"],
    })
    const byId = new Map(flows.map((flow) => [flow.flowId, flow]))

    expect(byId.get(publishedFlowId)?.nodes.map((entry) => entry.id)).toEqual([
      "11",
    ])
    expect(byId.get(publishedFlowId)?.flowName).toBe("Published")
    expect(byId.get(draftOnlyFlowId)?.nodes).toEqual([])
    expect(byId.has(foreignFlowId)).toBe(false)
    expect(byId.has("999")).toBe(false)
  })

  test("asking for no flows does no work", async () => {
    expect(
      await flowRepository.listCurrentVersionNodesByFlowIds({
        workspaceId,
        flowIds: [],
      }),
    ).toEqual([])
  })
})
