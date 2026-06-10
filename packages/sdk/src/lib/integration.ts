import type { MetadataPayload } from "@chatbotx.io/flow-config"
import type { AuthValue, Oauth2AuthValue } from "./auth"
import {
  AuthException,
  AuthRefreshException,
  IntegrationException,
  SdkException,
} from "./exception"
import type { SendFlowStepData } from "./flow-step-data"
import type {
  BaseConfig,
  Context,
  HandleRequestProps,
  Handler,
  IncomingContact,
  OutgoingContact,
  OutgoingMessage,
  ReceivedMessageResult,
} from "./shared"

// ---------------------------------------------------------------------------
// Constants & internal helpers
// ---------------------------------------------------------------------------

/** Buffer in milliseconds before the access token expires when we should refresh proactively. */
const AUTH_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Maximum attempts at calling the per-integration `refreshAuth` handler. */
const AUTH_REFRESH_MAX_ATTEMPTS = 3

/** Base backoff in ms; multiplied by 2^(attempt-1) between attempts. */
const AUTH_REFRESH_BACKOFF_BASE_MS = 250

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------
// Channel handler types
// ---------------------------------------------------------------------------

export type ChannelHandlerGroup = "message" | "conversation" | "contact" | "bot"

/** Base props for channel `sendFlowStep`; use {@link SendFlowStepProps} to narrow `data.step`. */
export type ChannelSendFlowStepProps<IAuth extends AuthValue> = {
  ctx: Context<IAuth>
  data: {
    contact: OutgoingContact
    flowId: string
    flowVersionId?: string
    step: SendFlowStepData
    metadata?: MetadataPayload
    sendFrom?: "inbox"
  }
}

export type MessageHandlers<
  IAuth extends AuthValue,
  TStep extends SendFlowStepData = SendFlowStepData,
> = {
  sendMessage: Handler<
    {
      ctx: Context<IAuth>
      data: {
        contact: OutgoingContact
        message: OutgoingMessage
        metadata?: MetadataPayload
        sendFrom?: "inbox"
      }
    },
    {
      messageIds: string[]
    }
  >
  receiveMessage: Handler<
    {
      ctx: Context<IAuth>
      data: {
        integrationType: string
        integrationIdentifier: string
        payload: unknown
      }
    },
    ReceivedMessageResult | null
  >
  sendFlowStep: Handler<
    {
      ctx: Context<IAuth>
      data: {
        contact: OutgoingContact
        flowId: string
        flowVersionId?: string
        step: TStep
        metadata?: MetadataPayload
        sendFrom?: "inbox"
      }
    },
    {
      messageIds: string[]
    }
  >
  handleMessageStatus?: Handler<
    {
      ctx: Context<IAuth>
      data: {
        integrationType: string
        integrationIdentifier: string
        payload: unknown
      }
    },
    ReceivedMessageResult | null
  >
}

export type ConversationHandlers<IAuth extends AuthValue> = {
  sendTyping: Handler<
    {
      ctx: Context<IAuth>
      data: {
        contact: OutgoingContact
        typing: boolean
        seconds?: number
      }
    },
    void
  >
  contactMarkAsRead: Handler<
    {
      ctx: Context<IAuth>
      data: {
        integrationType: string
        integrationIdentifier: string
        payload: unknown
      }
    },
    void
  >
  agentMarkAsRead: Handler<
    {
      ctx: Context<IAuth>
      data: {
        contact: OutgoingContact
      }
    },
    void
  >
}

/** Channel-agnostic label/tag descriptor (e.g. a Facebook Custom Label). */
export type ChannelLabel = {
  id: string
  name: string
}

export type ContactHandlers<IAuth extends AuthValue> = {
  getProfile: Handler<
    { ctx: Context<IAuth>; data: { sourceId: string } },
    IncomingContact
  >
  update: Handler<
    // biome-ignore lint/suspicious/noExplicitAny: safe pass any data
    { ctx: Context<IAuth>; data: any },
    void
  >
  block: Handler<
    { ctx: Context<IAuth>; data: { contact: OutgoingContact } },
    void
  >
  unblock: Handler<
    { ctx: Context<IAuth>; data: { contact: OutgoingContact } },
    void
  >
  // Per-user label operations (optional; channels that support labels).
  assignLabel?: Handler<
    { ctx: Context<IAuth>; data: { labelId: string; sourceId: string } },
    void
  >
  removeLabel?: Handler<
    { ctx: Context<IAuth>; data: { labelId: string; sourceId: string } },
    void
  >
}

export type BotHandlers<IAuth extends AuthValue> = {
  // biome-ignore lint/suspicious/noExplicitAny: safe pass any data
  updateProfile: Handler<{ ctx: Context<IAuth>; data: any }, void>
  addBranding: Handler<
    { ctx: Context<IAuth>; title: string; url: string },
    void
  >
  deleteProfileFields: Handler<{ ctx: Context<IAuth>; fields: string[] }, void>
  getProfilePictureUrl: Handler<{ ctx: Context<IAuth> }, string | undefined>
  // Label operations (optional; channels that support labels).
  createLabel?: Handler<
    { ctx: Context<IAuth>; data: { pageId: string; name: string } },
    ChannelLabel
  >
  // List the labels currently assigned to a specific user.
  listLabels?: Handler<
    { ctx: Context<IAuth>; data: { sourceId: string } },
    ChannelLabel[]
  >
  deleteLabel?: Handler<
    { ctx: Context<IAuth>; data: { labelId: string } },
    void
  >
}

export type IChannel<
  IAuth extends AuthValue,
  TStep extends SendFlowStepData = SendFlowStepData,
> = {
  message?: Partial<MessageHandlers<IAuth, TStep>>
  conversation?: Partial<ConversationHandlers<IAuth>>
  contact?: Partial<ContactHandlers<IAuth>>
  bot?: Partial<BotHandlers<IAuth>>
}

// ---------------------------------------------------------------------------
// Integration definition
// ---------------------------------------------------------------------------

export type IntegrationDefinition<
  IConfig extends BaseConfig,
  IAuth extends AuthValue,
  // biome-ignore lint/suspicious/noExplicitAny: wip
  IActions extends Record<string, Handler<any, any>> = Record<string, never>,
> = {
  name: string
  channels?: {
    channel: IChannel<IAuth>
    [key: string]: IChannel<IAuth>
  }
  actions: IActions
  handleRequest: Handler<
    HandleRequestProps<IConfig>,
    Oauth2AuthValue | string | number
  >
  disconnect: Handler<IAuth, void>
  refreshAuth?: Handler<{ auth: IAuth }, IAuth>
}

// ---------------------------------------------------------------------------
// Handler type utilities
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: structural function constraint
type AsHandler<H> = H extends (...args: any[]) => any ? H : never

/**
 * Map an {@link IntegrationDefinition} to its full set of channel handler
 * groups, with `IAuth` inferred from the definition. Used by
 * {@link Integration.runChannelHandler} to derive props/return types from the
 * SDK's authoritative `MessageHandlers` / `ConversationHandlers` /
 * `ContactHandlers` / `BotHandlers` shapes.
 */
export type IntegrationHandlerMap<T> =
  T extends IntegrationDefinition<
    // biome-ignore lint/suspicious/noExplicitAny: matches Integration generic
    any,
    infer IAuth,
    // biome-ignore lint/suspicious/noExplicitAny: matches Integration generic
    any
  >
    ? {
        message: MessageHandlers<IAuth>
        conversation: ConversationHandlers<IAuth>
        contact: ContactHandlers<IAuth>
        bot: BotHandlers<IAuth>
      }
    : never

/** Props of a specific channel handler, derived from the SDK handler defs. */
export type ChannelHandlerInput<
  T,
  Group extends keyof IntegrationHandlerMap<T>,
  Name extends keyof IntegrationHandlerMap<T>[Group],
> = Parameters<AsHandler<NonNullable<IntegrationHandlerMap<T>[Group][Name]>>>[0]

/** Awaited return type of a specific channel handler. */
export type ChannelHandlerResult<
  T,
  Group extends keyof IntegrationHandlerMap<T>,
  Name extends keyof IntegrationHandlerMap<T>[Group],
> = Awaited<
  ReturnType<AsHandler<NonNullable<IntegrationHandlerMap<T>[Group][Name]>>>
>

// ---------------------------------------------------------------------------
// Integration runtime
// ---------------------------------------------------------------------------

export class Integration<
  // biome-ignore lint/suspicious/noExplicitAny: wip
  T extends IntegrationDefinition<any, any, any>,
> {
  // biome-ignore lint/style/noParameterProperties: wip
  constructor(private readonly props: T) {}

  // -------------------------------------------------------------------------
  // Public accessors
  // -------------------------------------------------------------------------

  get name(): string {
    return this.props.name
  }

  get actions(): T["actions"] {
    return this.props.actions || {}
  }

  get channels() {
    // biome-ignore lint/suspicious/noExplicitAny: wip
    return this.props.channels || ({} as { [key: string]: IChannel<any> })
  }

  get disconnect(): T["disconnect"] {
    return this.props.disconnect
  }

  get handleRequest(): T["handleRequest"] {
    return this.props.handleRequest
  }

  get refreshAuth(): T["refreshAuth"] {
    return this.props.refreshAuth
  }

  // -------------------------------------------------------------------------
  // Public dispatch
  // -------------------------------------------------------------------------

  /**
   * Run a top-level integration action (e.g. Google Sheets `insertRow`) with
   * the same auth-refresh handling as {@link runChannelHandler}. If `props.ctx`
   * is absent the call is forwarded as-is.
   */
  async runAction<ActionName extends keyof T["actions"]>(
    actionName: ActionName,
    props: Parameters<Exclude<T["actions"][ActionName], undefined>>[0],
  ): Promise<ReturnType<Exclude<T["actions"][ActionName], undefined>>> {
    const action = this.actions?.[actionName]
    if (!action) {
      throw new Error(`Action "${String(actionName)}" not found.`)
    }
    return (await this.invokeWithRefresh(
      action as (input: unknown) => Promise<unknown>,
      props,
    )) as ReturnType<Exclude<T["actions"][ActionName], undefined>>
  }

  /**
   * Dispatch a channel handler (message/conversation/contact/bot) with auth-refresh handling.
   *
   * Props and return type are derived from the SDK handler definitions
   * ({@link MessageHandlers}, {@link ConversationHandlers},
   * {@link ContactHandlers}, {@link BotHandlers}) — they cannot be overridden
   * by the integration definition.
   *
   * Refreshes oauth2 tokens proactively (within {@link AUTH_REFRESH_BUFFER_MS} of expiry) and
   * reactively (once, on AuthException). Refreshed auth is persisted via `ctx.authStore.save`.
   */
  async runChannelHandler<
    Group extends keyof IntegrationHandlerMap<T>,
    Name extends keyof IntegrationHandlerMap<T>[Group],
  >(
    group: Group,
    name: Name,
    props: ChannelHandlerInput<T, Group, Name>,
  ): Promise<ChannelHandlerResult<T, Group, Name>> {
    // biome-ignore lint/suspicious/noExplicitAny: heterogeneous handler shapes
    const channel = this.channels?.channel as Record<string, any> | undefined
    const handler = channel?.[group as string]?.[name as string]
    if (typeof handler !== "function") {
      throw new IntegrationException(
        `Channel handler "${String(group)}.${String(name)}" not registered for integration "${this.name}".`,
      )
    }
    return (await this.invokeWithRefresh(
      handler as (input: unknown) => Promise<unknown>,
      props,
    )) as ChannelHandlerResult<T, Group, Name>
  }

  // -------------------------------------------------------------------------
  // Auth-refresh internals
  // -------------------------------------------------------------------------

  /**
   * Apply proactive + reactive auth refresh around a handler call. Looks for a
   * `ctx` field on `props`; if absent, forwards the call unchanged so non-ctx
   * actions still work.
   */
  private async invokeWithRefresh(
    handler: (input: unknown) => Promise<unknown>,
    props: unknown,
  ): Promise<unknown> {
    const initialCtx = (props as { ctx?: Context<AuthValue> } | undefined)?.ctx
    if (!initialCtx?.auth) {
      return await handler(props)
    }

    let ctx = initialCtx
    if (this.shouldProactivelyRefresh(ctx.auth)) {
      ctx = await this.refreshAndPersist(ctx)
    }

    try {
      return await handler({ ...(props as object), ctx })
    } catch (error) {
      if (error instanceof AuthException && this.props.refreshAuth) {
        ctx = await this.refreshAndPersist(ctx)
        return await handler({ ...(props as object), ctx })
      }
      throw error
    }
  }

  private shouldProactivelyRefresh(auth: AuthValue): boolean {
    if (!this.props.refreshAuth || auth.authType !== "oauth2") {
      return false
    }
    const expiresAt = auth.tokens.expiresAt
    if (!expiresAt) {
      return false
    }
    const expiresAtMs = Date.parse(expiresAt)
    if (Number.isNaN(expiresAtMs)) {
      return false
    }
    return expiresAtMs - Date.now() < AUTH_REFRESH_BUFFER_MS
  }

  private async refreshAndPersist(
    ctx: Context<AuthValue>,
  ): Promise<Context<AuthValue>> {
    const refreshAuth = this.props.refreshAuth
    if (!refreshAuth) {
      throw new SdkException(
        `Integration "${this.name}" does not implement refreshAuth.`,
      )
    }

    const run = async (): Promise<Context<AuthValue>> => {
      // Re-read current auth from the store to avoid clobbering a refresh that
      // a sibling worker already completed inside the same lock window.
      let baseAuth = ctx.auth
      if (ctx.authStore) {
        try {
          baseAuth = await ctx.authStore.load()
        } catch {
          // Fall back to the in-memory auth if reload fails.
        }
      }

      if (!this.shouldProactivelyRefresh(baseAuth)) {
        return { ...ctx, auth: baseAuth }
      }

      const newAuth = await this.refreshWithRetry(refreshAuth, baseAuth, ctx)
      if (ctx.authStore) {
        await ctx.authStore.save(newAuth)
      }
      return { ...ctx, auth: newAuth }
    }

    return ctx.authStore?.withLock ? await ctx.authStore.withLock(run) : run()
  }

  /**
   * Call the per-integration `refreshAuth` with bounded exponential backoff.
   * On terminal failure (refresh-token revoked, all retries exhausted) the
   * integration is marked offline via `ctx.authStore.markOffline` and an
   * {@link AuthRefreshException} is thrown.
   */
  private async refreshWithRetry(
    refreshAuth: NonNullable<T["refreshAuth"]>,
    baseAuth: AuthValue,
    ctx: Context<AuthValue>,
  ): Promise<AuthValue> {
    let lastError: unknown
    for (let attempt = 1; attempt <= AUTH_REFRESH_MAX_ATTEMPTS; attempt++) {
      try {
        return await refreshAuth({ auth: baseAuth })
      } catch (err) {
        lastError = err
        // AuthException signals a non-recoverable refresh failure
        // (revoked refresh token, invalid_grant, etc.) — stop retrying.
        if (err instanceof AuthException) {
          break
        }
        if (attempt < AUTH_REFRESH_MAX_ATTEMPTS) {
          await sleep(AUTH_REFRESH_BACKOFF_BASE_MS * 2 ** (attempt - 1))
        }
      }
    }

    if (ctx.authStore?.markOffline) {
      try {
        await ctx.authStore.markOffline(lastError)
      } catch {
        // Don't shadow the underlying refresh failure with a markOffline failure.
      }
    }

    throw new AuthRefreshException(
      `Integration "${this.name}" auth refresh failed after ${AUTH_REFRESH_MAX_ATTEMPTS} attempt(s); marked offline.`,
      lastError,
    )
  }
}
