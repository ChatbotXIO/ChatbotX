import { beforeEach, describe, expect, test, vi } from "vitest"

// Covers the flow action `findPlacesNearMe` (apps/worker/src/integration/
// handlers/find-places-near-me.ts): every "can't send" case is a silent skip,
// and the nearest place goes out as a plain whatsappLocation step.

const mocks = vi.hoisted(() => ({
  findContactLocation: vi.fn(),
  findNearest: vi.fn(),
  send: vi.fn(async () => undefined),
  info: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  findContactLocation: mocks.findContactLocation,
  placeLocationService: { findNearest: mocks.findNearest },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: mocks.info, error: vi.fn(), warn: vi.fn() },
}))

const { findPlacesNearMe } = await import(
  "../src/integration/handlers/find-places-near-me"
)

type Props = Parameters<typeof findPlacesNearMe>[0]

const locationNode = {
  id: "A",
  data: {
    details: {
      steps: [
        {
          id: "gud-1",
          stepType: "getUserData",
          replyFormat: "RF08",
          outputFieldId: "11",
        },
      ],
    },
  },
}
const actionNode = {
  id: "B",
  data: {
    details: {
      steps: [
        { id: "s1", stepType: "findPlacesNearMe", placeCategoryId: null },
      ],
    },
  },
}

function props(
  overrides: {
    channel?: string
    nodes?: unknown[]
    placeCategoryId?: string | null
  } = {},
): Props {
  return {
    conversation: { id: "conv-1", workspaceId: "ws-1", contactId: "c-1" },
    contactInbox: { id: "ci-1", channel: overrides.channel ?? "whatsapp" },
    flowVersion: {
      id: "fv-1",
      flowId: "f-1",
      nodes: overrides.nodes ?? [locationNode, actionNode],
      edges: [{ source: "A", target: "B" }],
    },
    commentAnchor: { commentId: "comment-1" },
    step: {
      id: "s1",
      nodeId: "B",
      stepType: "findPlacesNearMe",
      placeCategoryId:
        overrides.placeCategoryId === undefined
          ? null
          : overrides.placeCategoryId,
    },
  } as unknown as Props
}

const skippedWith = (reason: string) =>
  expect(mocks.info).toHaveBeenCalledWith(
    expect.objectContaining({ reason, stepId: "s1", conversationId: "conv-1" }),
    "findPlacesNearMe: skipped",
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe("findPlacesNearMe", () => {
  test("skips non-WhatsApp contacts", async () => {
    await findPlacesNearMe(props({ channel: "messenger" }), mocks.send)

    expect(mocks.findContactLocation).not.toHaveBeenCalled()
    expect(mocks.findNearest).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    skippedWith("notWhatsapp")
  })

  test("skips when no upstream location source", async () => {
    await findPlacesNearMe(props({ nodes: [actionNode] }), mocks.send)

    expect(mocks.findContactLocation).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    skippedWith("noLocationSource")
  })

  test("skips when the contact has no valid location", async () => {
    mocks.findContactLocation.mockResolvedValue(null)

    await findPlacesNearMe(props(), mocks.send)

    expect(mocks.findContactLocation).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      keys: ["11"],
    })
    expect(mocks.findNearest).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    skippedWith("noLocationValue")
  })

  test("skips when no place found", async () => {
    mocks.findContactLocation.mockResolvedValue({ latitude: 1, longitude: 2 })
    mocks.findNearest.mockResolvedValue(null)

    await findPlacesNearMe(props({ placeCategoryId: "7" }), mocks.send)

    expect(mocks.findNearest).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      categoryId: "7",
      latitude: 1,
      longitude: 2,
    })
    expect(mocks.send).not.toHaveBeenCalled()
    skippedWith("noPlaceFound")
  })

  test("sends the nearest place as a WhatsApp location", async () => {
    mocks.findContactLocation.mockResolvedValue({
      latitude: 10.8,
      longitude: 106.7,
    })
    mocks.findNearest.mockResolvedValue({
      id: "9",
      name: "District 1 Store",
      latitude: 10.7769,
      longitude: 106.7009,
      distanceKm: 2.6,
    })

    await findPlacesNearMe(props(), mocks.send)

    expect(mocks.findNearest).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: null }),
    )
    expect(mocks.send).toHaveBeenCalledOnce()
    const sent = mocks.send.mock.calls[0]?.[0] as unknown as Props & {
      step: Record<string, unknown>
    }
    expect(sent.step).toEqual({
      id: "s1",
      nodeId: "B",
      stepType: "whatsappLocation",
      latitude: 10.7769,
      longitude: 106.7009,
      name: "District 1 Store",
    })
    expect(sent.step).not.toHaveProperty("address")
    expect(sent.conversation).toMatchObject({ id: "conv-1" })
  })

  test("does not forward the comment anchor", async () => {
    mocks.findContactLocation.mockResolvedValue({ latitude: 1, longitude: 2 })
    mocks.findNearest.mockResolvedValue({
      id: "9",
      name: "Store",
      latitude: 1,
      longitude: 2,
      distanceKm: 0,
    })

    await findPlacesNearMe(props(), mocks.send)

    const sent = mocks.send.mock.calls[0]?.[0] as unknown as Props
    expect(sent.commentAnchor).toBeUndefined()
  })
})
