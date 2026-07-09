// @vitest-environment node

import {
  broadcastScheduleTypes,
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  flowFindFirst: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({
        action: (handler: unknown) => handler,
      }),
    }),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      flowModel: {
        findFirst: mocks.flowFindFirst,
      },
      messengerMessageTemplateModel: {
        findFirst: vi.fn(),
      },
      whatsappMessageTemplateModel: {
        findFirst: vi.fn(),
      },
    },
    insert: (table: unknown) => {
      mocks.insert(table)
      return {
        values: (values: Record<string, unknown>) => {
          mocks.values(values)
          return {
            returning: mocks.returning,
          }
        },
      }
    },
  },
}))

const { createBroadcastAction } = await import(
  "../src/features/broadcasts/actions/create-broadcast.action"
)
const runCreateBroadcastAction = createBroadcastAction as unknown as (
  props: Record<string, unknown>,
) => Promise<unknown>

beforeEach(() => {
  mocks.flowFindFirst.mockResolvedValue({ id: "flow-1", name: "Welcome" })
  mocks.insert.mockClear()
  mocks.values.mockClear()
  mocks.returning.mockResolvedValue([{ id: "broadcast-1" }])
})

describe("createBroadcastAction", () => {
  test("persists contactFilter on broadcast insert", async () => {
    const contactFilter = {
      operator: "and" as const,
      conditions: [
        {
          field: "fullName",
          operator: "contains",
          value: "Ada",
        },
      ],
    }

    await runCreateBroadcastAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: {
        channel: channelTypes.enum.messenger,
        flowId: "flow-1",
        subaction: broadcastSubactions.enum.allContacts,
        schedulesType: broadcastScheduleTypes.enum.future,
        schedulesAt: "2099-01-01T00:00:00.000Z",
        contactFilter,
        integrationMessengerId: "messenger-ui-only",
        buttons: [{ id: "btn-1", label: "Start", flowId: "flow-1" }],
      },
    })

    expect(mocks.values).toHaveBeenCalledTimes(1)
    expect(mocks.values.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        workspaceId: "ws-1",
        name: "Welcome",
        status: "scheduled",
        contactFilter,
      }),
    )
    expect(mocks.values.mock.calls[0]?.[0]).not.toHaveProperty(
      "integrationMessengerId",
    )
  })
})
