import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: { input: unknown }) => Promise<unknown>

const { authorizedAPI, handlersByPath } = vi.hoisted(() => {
  const handlersByPath: Record<string, Handler> = {}
  const makeProcedure = () => {
    let currentPath: string | undefined
    const procedure = {
      route: (config: { path: string }) => {
        currentPath = config.path
        return procedure
      },
      input: () => procedure,
      use: () => procedure,
      output: () => procedure,
      handler: (handler: Handler) => {
        if (currentPath) {
          handlersByPath[currentPath] = handler
        }
        return { handler }
      },
    }
    return procedure
  }
  return {
    authorizedAPI: {
      route: (config: { path: string }) => makeProcedure().route(config),
    },
    handlersByPath,
  }
})

const mocks = vi.hoisted(() => ({ listOptions: vi.fn() }))

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({
  workspaceAuthorizedMidddleware: vi.fn(),
}))
vi.mock("@chatbotx.io/business", () => ({
  tagService: { listOptions: mocks.listOptions },
}))
vi.mock("@/features/tags/queries", () => ({ listTags: vi.fn() }))

await import("@/features/tags/api/private")
const { listTagOptionsRequest, TAG_OPTIONS_MAX_PER_PAGE } = await import(
  "@/features/tags/schema/query"
)

const PATH = "/workspaces/{workspaceId}/tag-options"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("privateListWorkspaceTagOptionsAPI", () => {
  test("reads one page of options through the service", async () => {
    const page = {
      data: [{ id: "t-1", name: "alpha", color: null }],
      pageCount: 1,
    }
    mocks.listOptions.mockResolvedValue(page)
    const input = { workspaceId: "1", name: "al", page: 1, perPage: 50 }

    expect(await handlersByPath[PATH]?.({ input })).toEqual(page)
    expect(mocks.listOptions).toHaveBeenCalledWith(input)
  })
})

describe("listTagOptionsRequest", () => {
  test("defaults the page and page size", () => {
    expect(listTagOptionsRequest.parse({ workspaceId: "1" })).toMatchObject({
      page: 1,
      perPage: TAG_OPTIONS_MAX_PER_PAGE,
    })
  })

  test("rejects a page size above the maximum", () => {
    expect(
      listTagOptionsRequest.safeParse({
        workspaceId: "1",
        perPage: TAG_OPTIONS_MAX_PER_PAGE + 1,
      }).success,
    ).toBe(false)
  })
})
