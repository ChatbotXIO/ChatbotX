import { describe, expect, test } from "vitest"
import { createFlowRequest } from "@/features/flows/schema/action"

describe("createFlowRequest", () => {
  test("accepts a bare name/folderId body with no content", () => {
    const result = createFlowRequest.safeParse({
      name: "New flow",
      folderId: null,
    })

    expect(result.success).toBe(true)
  })

  test("accepts a raw nodes/edges body with no positions", () => {
    const result = createFlowRequest.safeParse({
      name: "New flow",
      folderId: null,
      nodes: [{ id: "n1" }, { id: "n2" }],
      edges: [{ source: "n1", target: "n2" }],
    })

    expect(result.success).toBe(true)
  })

  test("rejects a body combining spec with nodes", () => {
    const result = createFlowRequest.safeParse({
      name: "New flow",
      folderId: null,
      spec: {
        formatVersion: 1,
        name: "Spec flow",
        steps: [{ type: "send", text: "Hi" }],
      },
      nodes: [{ id: "n1" }],
    })

    expect(result.success).toBe(false)
    expect(result.success ? [] : result.error.issues[0].path).toEqual(["spec"])
  })

  test("rejects edges without nodes", () => {
    const result = createFlowRequest.safeParse({
      name: "New flow",
      folderId: null,
      edges: [{ source: "n1", target: "n2" }],
    })

    expect(result.success).toBe(false)
    expect(result.success ? [] : result.error.issues[0].path).toEqual(["edges"])
  })

  test("rejects publish: true with neither spec nor nodes", () => {
    const result = createFlowRequest.safeParse({
      name: "New flow",
      folderId: null,
      publish: true,
    })

    expect(result.success).toBe(false)
    expect(result.success ? [] : result.error.issues[0].path).toEqual([
      "publish",
    ])
  })

  test("accepts publish: true alongside spec", () => {
    const result = createFlowRequest.safeParse({
      name: "New flow",
      folderId: null,
      spec: {
        formatVersion: 1,
        name: "Spec flow",
        steps: [{ type: "send", text: "Hi" }],
      },
      publish: true,
    })

    expect(result.success).toBe(true)
  })

  test("accepts publish: true alongside nodes", () => {
    const result = createFlowRequest.safeParse({
      name: "New flow",
      folderId: null,
      nodes: [{ id: "n1" }],
      publish: true,
    })

    expect(result.success).toBe(true)
  })
})
