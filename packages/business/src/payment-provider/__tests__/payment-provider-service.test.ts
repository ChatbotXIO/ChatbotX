import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  find: vi.fn(),
  listByWorkspace: vi.fn(),
  findByExternalAccount: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  resolveForOwner: vi.fn(),
  findDecryptedById: vi.fn(),
  exchangeStripeCode: vi.fn(),
  readStripeAccount: vi.fn(),
  deauthorizeStripe: vi.fn(),
  connectPaypal: vi.fn(),
  disconnectPaypal: vi.fn(),
  readStripeKeyAccount: vi.fn(),
  createStripeAccountWebhook: vi.fn(),
  deleteStripeAccountWebhook: vi.fn(),
  createStripeGateway: vi.fn(),
  encryptObject: vi.fn(),
  decryptObject: vi.fn(),
  dropPaymentMethod: vi.fn(),
  countOrdersNeedingProvider: vi.fn(),
  invalidateSettings: vi.fn(),
  put: vi.fn(),
  runExclusive: vi.fn(),
  take: vi.fn(),
  get: vi.fn(),
  audit: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: (...args: unknown[]) => mocks.transaction(...args) },
  isUniqueViolationError: (error: { code?: string }) => error.code === "23505",
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  paymentProviderRepository: {
    find: (...args: unknown[]) => mocks.find(...args),
    findByExternalAccount: (...args: unknown[]) =>
      mocks.findByExternalAccount(...args),
    upsert: (...args: unknown[]) => mocks.upsert(...args),
    delete: (...args: unknown[]) => mocks.delete(...args),
    listByWorkspace: (...args: unknown[]) => mocks.listByWorkspace(...args),
  },
  orderPaymentRepository: {
    countOrdersNeedingProvider: (...args: unknown[]) =>
      mocks.countOrdersNeedingProvider(...args),
  },
}))

vi.mock("@chatbotx.io/encryption", () => ({
  encryptUtils: {
    encryptObject: (...args: unknown[]) => mocks.encryptObject(...args),
    decryptObject: (...args: unknown[]) => mocks.decryptObject(...args),
  },
}))

vi.mock("@chatbotx.io/payments", () => ({
  buildStripeAuthorizeUrl: (input: { state: string }) =>
    `https://connect.stripe.com/oauth/authorize?state=${input.state}`,
  exchangeStripeCode: (...args: unknown[]) => mocks.exchangeStripeCode(...args),
  readStripeAccount: (...args: unknown[]) => mocks.readStripeAccount(...args),
  deauthorizeStripe: (...args: unknown[]) => mocks.deauthorizeStripe(...args),
  connectPaypal: (...args: unknown[]) => mocks.connectPaypal(...args),
  disconnectPaypal: (...args: unknown[]) => mocks.disconnectPaypal(...args),
  readStripeKeyAccount: (...args: unknown[]) =>
    mocks.readStripeKeyAccount(...args),
  createStripeAccountWebhook: (...args: unknown[]) =>
    mocks.createStripeAccountWebhook(...args),
  deleteStripeAccountWebhook: (...args: unknown[]) =>
    mocks.deleteStripeAccountWebhook(...args),
  isStripeSecretKey: (key: string) =>
    key.startsWith("sk_") || key.startsWith("rk_"),
  createStripeGateway: (...args: unknown[]) =>
    mocks.createStripeGateway(...args),
  createPaypalGateway: vi.fn(),
  isPaymentProviderError: () => false,
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: (...args: unknown[]) => mocks.runExclusive(...args),
  },
  distributedStore: {
    put: (...args: unknown[]) => mocks.put(...args),
    take: (...args: unknown[]) => mocks.take(...args),
    get: (...args: unknown[]) => mocks.get(...args),
  },
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("../../platform-credential/service", () => ({
  platformCredentialService: {
    resolveForOwner: (...args: unknown[]) => mocks.resolveForOwner(...args),
    findDecryptedById: (...args: unknown[]) => mocks.findDecryptedById(...args),
  },
}))

vi.mock("../../ecommerce-settings/service", () => ({
  ecommerceSettingsService: {
    dropPaymentMethod: (...args: unknown[]) => mocks.dropPaymentMethod(...args),
    invalidate: (...args: unknown[]) => mocks.invalidateSettings(...args),
  },
}))

vi.mock("../../platform/settings", () => ({
  resolveWorkspaceAppUrl: async () => "https://app.test/",
}))

vi.mock("../../audit/dispatcher", () => ({
  dispatchAuditRecord: (...args: unknown[]) => mocks.audit(...args),
}))

vi.mock("../../logger", () => ({
  logger: { warn: (...args: unknown[]) => mocks.warn(...args) },
}))

const { paymentProviderService } = await import("../service")

const tx = { name: "tx" }

/** 32 random bytes, base64url. */
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/

const platformCredential = {
  id: "cred1",
  userId: null,
  config: { secretKey: "sk_test_platform", connectClientId: "ca_1" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(
    async (callback: (client: typeof tx) => unknown) => await callback(tx),
  )
  mocks.find.mockResolvedValue(undefined)
  mocks.findByExternalAccount.mockResolvedValue(undefined)
  mocks.deauthorizeStripe.mockResolvedValue(undefined)
  mocks.countOrdersNeedingProvider.mockResolvedValue(0)
  mocks.resolveForOwner.mockResolvedValue(platformCredential)
  mocks.findDecryptedById.mockResolvedValue(platformCredential)
  mocks.exchangeStripeCode.mockResolvedValue({
    accountId: "acct_1",
    livemode: false,
  })
  mocks.readStripeAccount.mockResolvedValue({
    label: "Acme",
    chargesEnabled: true,
  })
  mocks.upsert.mockImplementation(async (values: object) => ({
    id: "row1",
    createdAt: new Date(),
    ...values,
  }))
  mocks.encryptObject.mockResolvedValue({ v: 1, text: "cipher" })
  mocks.readStripeKeyAccount.mockResolvedValue({
    accountId: "acct_store",
    label: "Acme",
    chargesEnabled: true,
    livemode: false,
  })
  mocks.createStripeAccountWebhook.mockResolvedValue({
    endpointId: "we_new",
    secret: "whsec_new",
  })
  mocks.deleteStripeAccountWebhook.mockResolvedValue(undefined)
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
})

describe("paymentProviderService — Stripe Connect", () => {
  test("a connect link keeps a random single-use state for 15 minutes", async () => {
    const { url } = await paymentProviderService.createStripeConnectLink({
      workspaceId: "ws1",
      userId: "u1",
      platform: {
        credentialId: "cred1",
        userId: null,
        secretKey: "sk",
        clientId: "ca_1",
      },
      redirectUri: "https://app.test/integrations/stripe/callback",
      returnTo: "https://app.test/space/ws1/settings/integrations/stripe",
    })
    const state = new URL(url).searchParams.get("state") ?? ""
    expect(state).toMatch(STATE_PATTERN)
    expect(mocks.put).toHaveBeenCalledWith(
      `stripe-connect:${state}`,
      {
        workspaceId: "ws1",
        platformCredentialId: "cred1",
        returnTo: "https://app.test/space/ws1/settings/integrations/stripe",
        userId: "u1",
      },
      15 * 60,
    )
  })

  test("a made-up state is never looked up", async () => {
    await expect(
      paymentProviderService.takeStripeConnectState("not a state"),
    ).resolves.toBeNull()
    expect(mocks.take).not.toHaveBeenCalled()
  })

  test("connects the account the code names, with the platform key", async () => {
    const connected = await paymentProviderService.completeStripeConnect({
      workspaceId: "ws1",
      ownerId: "owner1",
      platformCredentialId: "cred1",
      code: "ac_1",
    })
    expect(mocks.exchangeStripeCode).toHaveBeenCalledWith({
      platformSecretKey: "sk_test_platform",
      code: "ac_1",
    })
    expect(mocks.upsert).toHaveBeenCalledWith({
      workspaceId: "ws1",
      provider: "stripe",
      livemode: false,
      accountLabel: "Acme",
      externalAccountId: "acct_1",
      platformCredentialId: "cred1",
      secret: null,
      webhookEndpointId: null,
    })
    expect(connected).toMatchObject({
      provider: "stripe",
      accountId: "acct_1",
      chargesEnabled: true,
    })
  })

  test("a platform whose Stripe settings changed meanwhile never exchanges the code", async () => {
    await expect(
      paymentProviderService.completeStripeConnect({
        workspaceId: "ws1",
        ownerId: "owner1",
        platformCredentialId: "cred-old",
        code: "ac_1",
      }),
    ).rejects.toMatchObject({ code: "stripePlatformNotConfigured" })
    expect(mocks.exchangeStripeCode).not.toHaveBeenCalled()
  })

  test("an account already connected to another workspace is refused", async () => {
    mocks.findByExternalAccount.mockResolvedValue({ workspaceId: "ws2" })
    await expect(
      paymentProviderService.completeStripeConnect({
        workspaceId: "ws1",
        ownerId: "owner1",
        platformCredentialId: "cred1",
        code: "ac_1",
      }),
    ).rejects.toMatchObject({ code: "stripeAccountAlreadyConnected" })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  test("another account cannot replace one that open orders still need", async () => {
    mocks.find.mockResolvedValue({
      workspaceId: "ws1",
      provider: "stripe",
      externalAccountId: "acct_old",
      platformCredentialId: "cred1",
    })
    mocks.countOrdersNeedingProvider.mockResolvedValue(1)
    await expect(
      paymentProviderService.completeStripeConnect({
        workspaceId: "ws1",
        ownerId: "owner1",
        platformCredentialId: "cred1",
        code: "ac_1",
      }),
    ).rejects.toMatchObject({ code: "paymentProviderInUse" })
    expect(mocks.upsert).not.toHaveBeenCalled()
    // The account just connected to the platform is let go again.
    expect(mocks.deauthorizeStripe).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct_1" }),
    )
  })

  test("another account replacing the old one disconnects the old one", async () => {
    mocks.find.mockResolvedValue({
      workspaceId: "ws1",
      provider: "stripe",
      externalAccountId: "acct_old",
      platformCredentialId: "cred1",
    })
    await paymentProviderService.completeStripeConnect({
      workspaceId: "ws1",
      ownerId: "owner1",
      platformCredentialId: "cred1",
      code: "ac_1",
    })
    expect(mocks.deauthorizeStripe).toHaveBeenCalledWith({
      platformSecretKey: "sk_test_platform",
      clientId: "ca_1",
      accountId: "acct_old",
    })
  })
})

describe("paymentProviderService — PayPal", () => {
  test("keeps the keys encrypted to this workspace, and only a masked id to show", async () => {
    mocks.connectPaypal.mockResolvedValue({
      livemode: false,
      secret: {
        clientId: "AbCdEfGhIjKl",
        clientSecret: "shh",
        livemode: false,
        webhookId: "WH-1",
      },
    })
    const connected = await paymentProviderService.connectPaypal({
      workspaceId: "ws1",
      clientId: "AbCdEfGhIjKl",
      clientSecret: "shh",
    })
    expect(mocks.connectPaypal).toHaveBeenCalledWith({
      clientId: "AbCdEfGhIjKl",
      clientSecret: "shh",
      webhookUrl: "https://app.test/api/payments/paypal/ws1/webhook",
    })
    expect(mocks.encryptObject).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: "shh" }),
      "ecommerce-payment:ws1:paypal",
    )
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "paypal",
        accountLabel: "AbCd…IjKl",
        secret: { v: 1, text: "cipher" },
        webhookEndpointId: "WH-1",
      }),
    )
    expect(JSON.stringify(connected)).not.toContain("shh")
  })
})

describe("paymentProviderService.teardownForPurge", () => {
  test("lets go of the store's Stripe account and removes its PayPal webhook, without the order guard", async () => {
    mocks.countOrdersNeedingProvider.mockResolvedValue(3)
    mocks.listByWorkspace.mockResolvedValue([
      {
        workspaceId: "ws1",
        provider: "stripe",
        externalAccountId: "acct_1",
        platformCredentialId: "cred1",
      },
      { workspaceId: "ws1", provider: "paypal", secret: { v: 1 } },
    ])
    mocks.decryptObject.mockResolvedValue({
      clientId: "client",
      clientSecret: "secret",
      livemode: false,
      webhookId: "WH1",
    })
    await paymentProviderService.teardownForPurge("ws1")
    expect(mocks.deauthorizeStripe).toHaveBeenCalledWith({
      platformSecretKey: "sk_test_platform",
      clientId: "ca_1",
      accountId: "acct_1",
    })
    expect(mocks.disconnectPaypal).toHaveBeenCalledWith(
      expect.objectContaining({ webhookId: "WH1" }),
    )
    expect(mocks.countOrdersNeedingProvider).not.toHaveBeenCalled()
  })

  test("a provider that fails never stops the purge", async () => {
    mocks.listByWorkspace.mockResolvedValue([
      {
        workspaceId: "ws1",
        provider: "stripe",
        externalAccountId: "acct_1",
        platformCredentialId: "cred1",
      },
    ])
    mocks.deauthorizeStripe.mockRejectedValue(new Error("stripe down"))
    await expect(
      paymentProviderService.teardownForPurge("ws1"),
    ).resolves.toBeUndefined()
  })
})

describe("paymentProviderService.disconnect", () => {
  test("a provider that does not answer still lets the store disconnect", async () => {
    mocks.find.mockResolvedValue({
      workspaceId: "ws1",
      provider: "stripe",
      externalAccountId: "acct_1",
      platformCredentialId: "cred1",
    })
    mocks.deauthorizeStripe.mockRejectedValue(new Error("stripe down"))
    await paymentProviderService.disconnect({
      workspaceId: "ws1",
      provider: "stripe",
    })
    expect(mocks.delete).toHaveBeenCalledWith(
      { workspaceId: "ws1", provider: "stripe" },
      tx,
    )
    expect(mocks.dropPaymentMethod).toHaveBeenCalledWith(
      { workspaceId: "ws1", method: "stripe" },
      tx,
    )
  })

  test("a store that disconnects from Stripe's side loses the method too", async () => {
    mocks.findByExternalAccount.mockResolvedValue({
      workspaceId: "ws1",
      updatedAt: new Date("2026-10-01T00:00:00Z"),
    })
    await paymentProviderService.handleStripeDeauthorized({
      platformCredentialId: "cred1",
      accountId: "acct_1",
      deauthorizedAt: new Date("2026-10-02T00:00:00Z"),
    })
    expect(mocks.dropPaymentMethod).toHaveBeenCalledWith(
      { workspaceId: "ws1", method: "stripe" },
      tx,
    )
  })

  test("a late deauthorization never removes a newer connection", async () => {
    mocks.findByExternalAccount.mockResolvedValue({
      workspaceId: "ws1",
      updatedAt: new Date("2026-10-03T00:00:00Z"),
    })
    await paymentProviderService.handleStripeDeauthorized({
      platformCredentialId: "cred1",
      accountId: "acct_1",
      deauthorizedAt: new Date("2026-10-02T00:00:00Z"),
    })
    expect(mocks.delete).not.toHaveBeenCalled()
    expect(mocks.dropPaymentMethod).not.toHaveBeenCalled()
  })

  test("orders still needing the account refuse a disconnect", async () => {
    mocks.find.mockResolvedValue({
      workspaceId: "ws1",
      provider: "stripe",
      externalAccountId: "acct_1",
      platformCredentialId: "cred1",
    })
    mocks.countOrdersNeedingProvider.mockResolvedValue(2)
    await expect(
      paymentProviderService.disconnect({
        workspaceId: "ws1",
        provider: "stripe",
      }),
    ).rejects.toMatchObject({
      code: "paymentProviderInUse",
      data: { provider: "stripe", count: 2 },
    })
    expect(mocks.deauthorizeStripe).not.toHaveBeenCalled()
    expect(mocks.delete).not.toHaveBeenCalled()
  })
})

describe("paymentProviderService — Stripe secret key", () => {
  const keyRow = {
    workspaceId: "ws1",
    provider: "stripe",
    livemode: false,
    accountLabel: "Acme",
    externalAccountId: "acct_store",
    platformCredentialId: null,
    secret: { v: 1, text: "old" },
    webhookEndpointId: "we_old",
    createdAt: new Date(),
  }
  const keySecret = {
    secretKey: "sk_test_old",
    livemode: false,
    accountId: "acct_store",
    webhookId: "we_old",
    webhookSecret: "whsec_old",
  }

  test("checks the key, creates the webhook, keeps both encrypted to this workspace", async () => {
    const connected = await paymentProviderService.connectStripeKey({
      workspaceId: "ws1",
      secretKey: " sk_test_store ",
    })
    expect(mocks.readStripeKeyAccount).toHaveBeenCalledWith("sk_test_store")
    expect(mocks.createStripeAccountWebhook).toHaveBeenCalledWith({
      secretKey: "sk_test_store",
      url: "https://app.test/api/payments/stripe/workspace/ws1/webhook",
    })
    expect(mocks.encryptObject).toHaveBeenCalledWith(
      {
        secretKey: "sk_test_store",
        livemode: false,
        accountId: "acct_store",
        webhookId: "we_new",
        webhookSecret: "whsec_new",
      },
      "ecommerce-payment:ws1:stripe",
    )
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "stripe",
        externalAccountId: "acct_store",
        platformCredentialId: null,
        secret: { v: 1, text: "cipher" },
        webhookEndpointId: "we_new",
      }),
    )
    expect(connected).toMatchObject({
      connectionType: "apiKey",
      accountId: "acct_store",
      chargesEnabled: true,
    })
    expect(JSON.stringify(connected)).not.toContain("sk_test_store")
  })

  test("a publishable key is refused before Stripe is called", async () => {
    await expect(
      paymentProviderService.connectStripeKey({
        workspaceId: "ws1",
        secretKey: "pk_test_store",
      }),
    ).rejects.toMatchObject({ code: "stripeSecretKeyInvalid" })
    expect(mocks.readStripeKeyAccount).not.toHaveBeenCalled()
  })

  test("another account is refused while orders still need the old one", async () => {
    mocks.find.mockResolvedValue({
      ...keyRow,
      externalAccountId: "acct_other",
    })
    mocks.countOrdersNeedingProvider.mockResolvedValue(1)
    await expect(
      paymentProviderService.connectStripeKey({
        workspaceId: "ws1",
        secretKey: "sk_test_store",
      }),
    ).rejects.toMatchObject({ code: "paymentProviderInUse" })
    expect(mocks.createStripeAccountWebhook).not.toHaveBeenCalled()
  })

  test("the same account moving from Stripe Connect to a key keeps its orders and lets the platform go", async () => {
    mocks.find.mockResolvedValue({
      workspaceId: "ws1",
      provider: "stripe",
      externalAccountId: "acct_store",
      platformCredentialId: "cred1",
      secret: null,
      livemode: false,
    })
    mocks.countOrdersNeedingProvider.mockResolvedValue(1)
    await paymentProviderService.connectStripeKey({
      workspaceId: "ws1",
      secretKey: "sk_test_store",
    })
    expect(mocks.countOrdersNeedingProvider).not.toHaveBeenCalled()
    expect(mocks.deauthorizeStripe).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct_store" }),
    )
  })

  test("a new key of the same account removes the old webhook with the new key", async () => {
    mocks.find.mockResolvedValue(keyRow)
    mocks.decryptObject.mockResolvedValue(keySecret)
    await paymentProviderService.connectStripeKey({
      workspaceId: "ws1",
      secretKey: "sk_test_store",
    })
    expect(mocks.deleteStripeAccountWebhook).toHaveBeenCalledTimes(1)
    expect(mocks.deleteStripeAccountWebhook).toHaveBeenCalledWith({
      secretKey: "sk_test_store",
      endpointId: "we_old",
    })
    expect(mocks.deauthorizeStripe).not.toHaveBeenCalled()
  })

  test("falls back to the old key when the new one cannot remove the webhook", async () => {
    mocks.find.mockResolvedValue(keyRow)
    mocks.decryptObject.mockResolvedValue(keySecret)
    mocks.deleteStripeAccountWebhook
      .mockRejectedValueOnce(new Error("no permission"))
      .mockResolvedValueOnce(undefined)
    await paymentProviderService.connectStripeKey({
      workspaceId: "ws1",
      secretKey: "sk_test_store",
    })
    expect(mocks.deleteStripeAccountWebhook).toHaveBeenLastCalledWith({
      secretKey: "sk_test_old",
      endpointId: "we_old",
    })
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  test("another account's old webhook is removed with the old key only", async () => {
    mocks.find.mockResolvedValue({ ...keyRow, externalAccountId: "acct_other" })
    mocks.decryptObject.mockResolvedValue({
      ...keySecret,
      accountId: "acct_other",
    })
    await paymentProviderService.connectStripeKey({
      workspaceId: "ws1",
      secretKey: "sk_test_store",
    })
    expect(mocks.deleteStripeAccountWebhook).toHaveBeenCalledTimes(1)
    expect(mocks.deleteStripeAccountWebhook).toHaveBeenCalledWith({
      secretKey: "sk_test_old",
      endpointId: "we_old",
    })
  })

  test("the same account in the other mode is refused while orders still need it", async () => {
    mocks.find.mockResolvedValue(keyRow)
    mocks.readStripeKeyAccount.mockResolvedValue({
      accountId: "acct_store",
      label: "Acme",
      chargesEnabled: true,
      livemode: true,
    })
    mocks.countOrdersNeedingProvider.mockResolvedValue(1)
    await expect(
      paymentProviderService.connectStripeKey({
        workspaceId: "ws1",
        secretKey: "sk_live_store",
      }),
    ).rejects.toMatchObject({ code: "paymentProviderInUse" })
    expect(mocks.createStripeAccountWebhook).not.toHaveBeenCalled()
  })

  test("one connect at a time per workspace", async () => {
    await paymentProviderService.connectStripeKey({
      workspaceId: "ws1",
      secretKey: "sk_test_store",
    })
    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({ key: "payment-provider-connect:ws1:stripe" }),
    )
    const [{ fn }] = mocks.runExclusive.mock.calls[0] as [
      { fn: () => Promise<unknown> },
    ]
    expect(fn).toBeTypeOf("function")
    expect(mocks.createStripeAccountWebhook).toHaveBeenCalledTimes(1)
  })

  test("payments go through the store's own key", async () => {
    mocks.find.mockResolvedValue(keyRow)
    mocks.decryptObject.mockResolvedValue(keySecret)
    await paymentProviderService.loadGateway({
      workspaceId: "ws1",
      provider: "stripe",
    })
    expect(mocks.createStripeGateway).toHaveBeenCalledWith({
      secretKey: "sk_test_old",
    })
    expect(mocks.findDecryptedById).not.toHaveBeenCalled()
  })

  test("disconnecting removes the webhook instead of deauthorizing", async () => {
    mocks.find.mockResolvedValue(keyRow)
    mocks.decryptObject.mockResolvedValue(keySecret)
    await paymentProviderService.disconnect({
      workspaceId: "ws1",
      provider: "stripe",
    })
    expect(mocks.deleteStripeAccountWebhook).toHaveBeenCalledWith({
      secretKey: "sk_test_old",
      endpointId: "we_old",
    })
    expect(mocks.deauthorizeStripe).not.toHaveBeenCalled()
    expect(mocks.delete).toHaveBeenCalled()
  })

  test("Stripe Connect on the same account in the other mode checks the orders", async () => {
    mocks.find.mockResolvedValue(keyRow)
    mocks.exchangeStripeCode.mockResolvedValue({
      accountId: "acct_store",
      livemode: true,
    })
    mocks.countOrdersNeedingProvider.mockResolvedValue(1)
    await expect(
      paymentProviderService.completeStripeConnect({
        workspaceId: "ws1",
        ownerId: "owner1",
        platformCredentialId: "cred1",
        code: "ac_1",
      }),
    ).rejects.toMatchObject({ code: "paymentProviderInUse" })
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.deleteStripeAccountWebhook).not.toHaveBeenCalled()
  })

  test("Stripe Connect replacing a key connection removes its webhook", async () => {
    mocks.find.mockResolvedValue(keyRow)
    mocks.decryptObject.mockResolvedValue(keySecret)
    mocks.exchangeStripeCode.mockResolvedValue({
      accountId: "acct_store",
      livemode: false,
    })
    await paymentProviderService.completeStripeConnect({
      workspaceId: "ws1",
      ownerId: "owner1",
      platformCredentialId: "cred1",
      code: "ac_1",
    })
    expect(mocks.deleteStripeAccountWebhook).toHaveBeenCalledWith({
      secretKey: "sk_test_old",
      endpointId: "we_old",
    })
  })
})
