// @vitest-environment jsdom

import { systemFieldTypes } from "@chatbotx.io/database/partials"
import { formatBotFieldReference } from "@chatbotx.io/flow-config"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { makeQueryClient } from "../../../../../__tests__/query-test-utils"
import {
  buildGroupedFieldOptions,
  customFieldIconsMap,
  useCustomFieldSelectOptions,
  useCustomFields,
  useInvalidateBotFields,
} from "../custom-field-hook"

const { mockListCustomFields, mockListBotFields } = vi.hoisted(() => ({
  mockListCustomFields: vi.fn(),
  mockListBotFields: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    customFieldsAPI: {
      privateListCustomFieldsAPI: mockListCustomFields,
    },
    botFieldAPIs: {
      privateListBotFieldsAPI: mockListBotFields,
    },
  },
}))

vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "workspace-1" }),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
function CustomFieldsProbe({ onData }: { onData: (data: unknown) => void }) {
  onData(useCustomFields("workspace-1").data)
  return null
}

function InvalidateBotFieldsProbe({
  onReady,
}: {
  onReady: (invalidate: () => unknown) => void
}) {
  onReady(useInvalidateBotFields())
  return null
}

const option = (value: string): SelectOption => ({ value, label: value })

describe("buildGroupedFieldOptions", () => {
  test("returns one group per non-empty section, in system/custom/account order", () => {
    const groups = buildGroupedFieldOptions({
      systemFields: { label: "System Fields", options: [option("first_name")] },
      customFields: {
        label: "Custom Fields",
        options: [option("1"), option("2")],
      },
      accountFields: {
        label: "Account Fields",
        options: [option("bot_field:1")],
      },
    })

    expect(groups).toHaveLength(3)
    expect(groups[0]?.label).toBe("System Fields")
    expect(groups[0]?.children).toEqual([option("first_name")])
    expect(groups[1]?.label).toBe("Custom Fields")
    expect(groups[1]?.children).toEqual([option("1"), option("2")])
    expect(groups[2]?.label).toBe("Account Fields")
    expect(groups[2]?.children).toEqual([option("bot_field:1")])
  })

  test("omits a group entirely when it has no options", () => {
    const groups = buildGroupedFieldOptions({
      systemFields: { label: "System Fields", options: [] },
      customFields: { label: "Custom Fields", options: [option("1")] },
      accountFields: { label: "Account Fields", options: [] },
    })

    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBe("Custom Fields")
  })

  test("returns an empty array when every section is empty", () => {
    const groups = buildGroupedFieldOptions({
      systemFields: { label: "System Fields", options: [] },
      customFields: { label: "Custom Fields", options: [] },
      accountFields: { label: "Account Fields", options: [] },
    })

    expect(groups).toEqual([])
  })

  test("each group option carries a unique value so React keys never collide", () => {
    const groups = buildGroupedFieldOptions({
      systemFields: { label: "System Fields", options: [option("a")] },
      customFields: { label: "Custom Fields", options: [option("b")] },
      accountFields: { label: "Account Fields", options: [option("c")] },
    })

    const values = groups.map((group) => group.value)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe("custom field query hooks", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockListCustomFields.mockResolvedValue({
      data: [{ id: "field-1", name: "Company", type: "shortText" }],
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = makeQueryClient()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    queryClient.clear()
  })

  test("returns the custom field data array from the API response", async () => {
    let returnedData: unknown

    act(() => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(CustomFieldsProbe, {
            onData: (data) => {
              returnedData = data
            },
          }),
        ),
      )
    })

    await vi.waitFor(() => {
      expect(returnedData).toEqual([
        { id: "field-1", name: "Company", type: "shortText" },
      ])
    })
  })
  test("invalidates the bot field query key", async () => {
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries")
    let invalidateBotFields: (() => unknown) | undefined

    act(() => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(InvalidateBotFieldsProbe, {
            onReady: (invalidate) => {
              invalidateBotFields = invalidate
            },
          }),
        ),
      )
    })

    await act(async () => {
      await invalidateBotFields?.()
    })

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [["botFieldAPIs", "privateListBotFieldsAPI"], {}],
    })
  })
})

function CustomFieldSelectOptionsProbe({
  onData,
  ...props
}: {
  onData: (data: SelectOption[]) => void
} & Parameters<typeof useCustomFieldSelectOptions>[0]) {
  onData(useCustomFieldSelectOptions(props))
  return null
}

describe("useCustomFieldSelectOptions", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  let data: SelectOption[] | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mockListCustomFields.mockResolvedValue({
      data: [
        { id: "field-1", name: "Company", type: "shortText" },
        { id: "field-2", name: "Revenue", type: "number" },
      ],
    })
    mockListBotFields.mockResolvedValue({
      data: [{ id: "bot-1", name: "Order Total", type: "number" }],
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    data = undefined
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    queryClient.clear()
  })

  const render = (
    props: Parameters<typeof useCustomFieldSelectOptions>[0] = {},
  ) => {
    act(() => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(CustomFieldSelectOptionsProbe, {
            ...props,
            onData: (next) => (data = next),
          }),
        ),
      )
    })
  }

  test("defaults to a flat list of custom fields only, with no reserved or bot fields", async () => {
    render()

    await vi.waitFor(() => {
      expect(data).toEqual([
        {
          label: "Company",
          value: "field-1",
          icon: customFieldIconsMap.shortText,
        },
        {
          label: "Revenue",
          value: "field-2",
          icon: customFieldIconsMap.number,
        },
      ])
    })
  })

  test("drops a reserved field whose channels do not overlap the requested channels", async () => {
    render({
      includeReserved: true,
      reservedFieldIds: [
        systemFieldTypes.enum.email,
        systemFieldTypes.enum.fb_chat_link,
      ],
      channels: ["whatsapp"],
    })

    await vi.waitFor(() => {
      expect(data?.map((option) => option.label)).toEqual([
        "fields.email.label",
        "Company",
        "Revenue",
      ])
    })
  })

  test("keeps a channel-scoped reserved field when the requested channel matches", async () => {
    render({
      includeReserved: true,
      reservedFieldIds: [systemFieldTypes.enum.fb_chat_link],
      channels: ["messenger"],
    })

    await vi.waitFor(() => {
      expect(data?.map((option) => option.label)).toEqual([
        "fields.fbChatLink.label",
        "Company",
        "Revenue",
      ])
    })
  })

  test("groups system/custom/account fields and formats the bot-field reference when includeBotFields is set", async () => {
    render({ includeBotFields: true })

    await vi.waitFor(() => {
      expect(data).toHaveLength(2)
    })
    expect(data?.map((group) => group.label)).toEqual([
      "fields.customField.groupCustomFields",
      "fields.customField.groupAccountFields",
    ])
    expect(data?.[1]?.children).toEqual([
      {
        label: "Order Total",
        value: formatBotFieldReference("bot-1"),
        icon: customFieldIconsMap.number,
      },
    ])
  })

  test("applies customFieldTypes and prefix together", async () => {
    render({ customFieldTypes: ["number"], prefix: "field" })

    await vi.waitFor(() => {
      expect(data).toEqual([
        {
          label: "Revenue",
          value: "field:field-2",
          icon: customFieldIconsMap.number,
        },
      ])
    })
  })
})
