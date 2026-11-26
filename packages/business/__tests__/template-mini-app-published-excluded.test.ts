// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ listPublished: vi.fn() }))

vi.mock("@chatbotx.io/database/repositories", () => ({
  miniAppRepository: { listPublishedNamesByIds: mocks.listPublished },
}))

const { collectMiniAppIds, findMiniAppPublishedExclusions } = await import(
  "../src/template/mini-app-published-excluded"
)

const openMiniApp = (miniAppId: string) => ({
  sourceId: "f1",
  name: "Opens",
  nodes: [
    {
      id: "n1",
      data: {
        details: {
          steps: [{ id: "s1", stepType: "openMiniApp", miniAppId }],
        },
      },
    },
  ],
})
const linkFlow = (name: string, id: string) => ({
  sourceId: name,
  name,
  nodes: [
    {
      id: "n1",
      data: {
        details: {
          steps: [
            {
              id: "s1",
              stepType: "sendText",
              text: `https://x.test/mini-apps?id=${id}&token={{mini_app_token}}`,
            },
          ],
        },
      },
    },
  ],
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listPublished.mockResolvedValue([])
})

describe("collectMiniAppIds", () => {
  test("reads miniAppId slots and mini-apps links, ignoring non-numeric ids", () => {
    expect(collectMiniAppIds(openMiniApp("12"))).toEqual(new Set(["12"]))
    expect(collectMiniAppIds(linkFlow("L", "34"))).toEqual(new Set(["34"]))
    expect(collectMiniAppIds(openMiniApp(""))).toEqual(new Set())
  })
})

describe("findMiniAppPublishedExclusions", () => {
  test("names the flow and the published Mini App, one batched query", async () => {
    mocks.listPublished.mockResolvedValue([{ id: "12", name: "Booking" }])

    const result = await findMiniAppPublishedExclusions(
      "ws-1",
      [
        { ...openMiniApp("12"), name: "Flow A" },
        linkFlow("Flow B", "12"),
        linkFlow("Flow C", "99"),
      ],
      new Set(),
    )

    expect(result).toEqual([
      { flowName: "Flow A", miniAppName: "Booking" },
      { flowName: "Flow B", miniAppName: "Booking" },
    ])
    expect(mocks.listPublished).toHaveBeenCalledTimes(1)
    expect(mocks.listPublished).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["12", "99"],
    })
  })

  test("skips Mini Apps the template ships", async () => {
    const result = await findMiniAppPublishedExclusions(
      "ws-1",
      [openMiniApp("12")],
      new Set(["12"]),
    )
    expect(result).toEqual([])
    expect(mocks.listPublished).not.toHaveBeenCalled()
  })
})
