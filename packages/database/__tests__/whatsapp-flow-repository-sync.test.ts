import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// whatsappFlowRepository.syncForIntegration — reconciles the locally-cached
// WhatsApp flows for an integration against Meta's list: deletes stale rows,
// updates existing ones, inserts new ones with completedCount "0".
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  createId: vi.fn(() => "new-id"),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {
    select: mocks.select,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.del,
  },
  eq: mocks.eq,
  inArray: mocks.inArray,
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings,
    values,
  })),
}))

vi.mock("../src/schema", () => ({
  whatsappFlowModel: {
    id: "id",
    sourceId: "sourceId",
    integrationWhatsappId: "integrationWhatsappId",
    name: "name",
    status: "status",
    categories: "categories",
    validationErrors: "validationErrors",
    completedCount: "completedCount",
  },
}))

const { whatsappFlowRepository } = await import(
  "../src/repositories/whatsapp-flow/repository"
)

function selectChain(finalResult: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => Promise.resolve(finalResult)),
  }
  return builder
}

function mutationChain() {
  const builder = {
    values: vi.fn(() => Promise.resolve(undefined)),
    set: vi.fn(() => builder),
    where: vi.fn(() => Promise.resolve(undefined)),
  }
  return builder
}

describe("whatsappFlowRepository.syncForIntegration", () => {
  test("deletes stale flows, updates existing ones, inserts new ones", async () => {
    mocks.select.mockReturnValue(
      selectChain([
        { id: "flow_stale", sourceId: "src_stale" },
        { id: "flow_existing", sourceId: "src_existing" },
      ]),
    )
    const deleteBuilder = mutationChain()
    const updateBuilder = mutationChain()
    const insertBuilder = mutationChain()
    mocks.del.mockReturnValue(deleteBuilder)
    mocks.update.mockReturnValue(updateBuilder)
    mocks.insert.mockReturnValue(insertBuilder)

    const tx = {
      select: mocks.select,
      insert: mocks.insert,
      update: mocks.update,
      delete: mocks.del,
    } as unknown as Parameters<
      typeof whatsappFlowRepository.syncForIntegration
    >[1]

    await whatsappFlowRepository.syncForIntegration(
      {
        integrationWhatsappId: "iw_1",
        flows: [
          {
            id: "src_existing",
            name: "Existing Flow",
            status: "PUBLISHED",
            categories: ["OTHER"],
            validation_errors: [],
          },
          {
            id: "src_new",
            name: "New Flow",
            status: "DRAFT",
            categories: ["OTHER"],
            validation_errors: [],
          },
        ],
      },
      tx,
    )

    // Stale flow (src_stale not in the incoming set) is deleted.
    expect(mocks.del).toHaveBeenCalled()
    expect(mocks.inArray).toHaveBeenCalledWith("id", ["flow_stale"])

    // Existing flow is updated.
    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Existing Flow", status: "PUBLISHED" }),
    )

    // New flow is inserted with completedCount "0" and a fresh id.
    expect(insertBuilder.values).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "new-id",
        name: "New Flow",
        sourceId: "src_new",
        integrationWhatsappId: "iw_1",
        completedCount: "0",
      }),
    ])
  })

  test("opens its own transaction when tx is omitted", async () => {
    const transactionSpy = vi.fn(
      async (callback: (client: unknown) => Promise<unknown>) => {
        const client = {
          select: mocks.select,
          insert: mocks.insert,
          update: mocks.update,
          delete: mocks.del,
        }
        return await callback(client)
      },
    )

    mocks.select.mockReturnValue(selectChain([]))
    mocks.insert.mockReturnValue(mutationChain())

    vi.doMock("../src/client", () => ({
      and: mocks.and,
      db: {
        select: mocks.select,
        insert: mocks.insert,
        update: mocks.update,
        delete: mocks.del,
        transaction: transactionSpy,
      },
      eq: mocks.eq,
      inArray: mocks.inArray,
      sql: vi.fn(),
    }))
    vi.resetModules()

    const { whatsappFlowRepository: freshRepository } = await import(
      "../src/repositories/whatsapp-flow/repository"
    )

    await freshRepository.syncForIntegration({
      integrationWhatsappId: "iw_1",
      flows: [],
    })

    expect(transactionSpy).toHaveBeenCalledOnce()
  })
})
