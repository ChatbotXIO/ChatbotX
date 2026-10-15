import { describe, expect, test, vi } from "vitest"
import { productRepository } from "../src/repositories/product/repository"

// ---------------------------------------------------------------------------
// productRepository.list: the `ids` filter a picker uses to name the products
// it already holds. Runs against a query-builder double passed as `tx` and
// asserts the where object the query is built from, without a database.
// ---------------------------------------------------------------------------

const fakeTransaction = () => {
  const findMany = vi.fn(async () => [])
  const count = vi.fn(async () => 0)
  const tx = {
    query: { productModel: { findMany } },
    $count: count,
  }
  return { tx: tx as never, findMany }
}

const whereOf = (findMany: ReturnType<typeof vi.fn>) =>
  (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0]
    .where

describe("productRepository.list ids filter", () => {
  test("restricts the list to the given ids, within the workspace", async () => {
    const { tx, findMany } = fakeTransaction()

    await productRepository.list({ workspaceId: "ws-1", ids: ["1", "2"] }, tx)

    expect(whereOf(findMany)).toMatchObject({
      workspaceId: "ws-1",
      id: { in: ["1", "2"] },
    })
  })

  test.each([
    ["omitted", undefined],
    ["null", null],
    ["empty", []],
  ])("applies no id filter when ids is %s", async (_label, ids) => {
    const { tx, findMany } = fakeTransaction()

    await productRepository.list({ workspaceId: "ws-1", ids }, tx)

    expect(whereOf(findMany).id).toBeUndefined()
  })
})
