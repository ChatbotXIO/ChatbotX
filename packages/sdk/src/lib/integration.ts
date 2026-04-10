import type { AuthValue, Oauth2AuthValue } from "./auth"
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

/** Base props for channel `sendFlowStep`; use {@link SendFlowStepProps} to narrow `data.step`. */
export type ChannelSendFlowStepProps<IAuth extends AuthValue> = {
  ctx: Context<IAuth>
  data: {
    contact: OutgoingContact
    flowId: string
    flowVersionId?: string
    step: SendFlowStepData
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
      }
    },
    {
      messageIds: string[]
    }
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

export type ContactHandlers<IAuth extends AuthValue> = {
  getProfile: Handler<
    { ctx: Context<IAuth>; data: { sourceId: string } },
    IncomingContact
  >
  block: Handler<
    { ctx: Context<IAuth>; data: { contact: OutgoingContact } },
    void
  >
  unblock: Handler<
    { ctx: Context<IAuth>; data: { contact: OutgoingContact } },
    void
  >
}

export type BotHandlers<IAuth extends AuthValue> = {
  getProfile: Handler<
    { ctx: Context<IAuth>; data: { sourceId: string } },
    IncomingContact
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
}

export class Integration<
  // biome-ignore lint/suspicious/noExplicitAny: wip
  T extends IntegrationDefinition<any, any, any>,
> {
  // biome-ignore lint/style/noParameterProperties: wip
  constructor(private readonly props: T) {
    // this.validateProps(props);
  }

  // private validateProps(props: IntegrationProps<AI, AO, HI>) {
  //   integrationPropsSchema.parse(props);
  // }

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

  // get authorize(): Handler<AI, AO> | undefined {
  //   return this.props.authorize;
  // }

  // get connect(): Handler<AI, string> | undefined {
  //   return this.props.connect;
  // }

  get disconnect(): T["disconnect"] {
    return this.props.disconnect
  }

  get handleRequest(): T["handleRequest"] {
    return this.props.handleRequest
  }

  async runAction<ActionName extends keyof T["actions"]>(
    actionName: ActionName,
    props: Parameters<Exclude<T["actions"][ActionName], undefined>>[0],
  ): Promise<ReturnType<Exclude<T["actions"][ActionName], undefined>>> {
    const action = this.actions?.[actionName]
    if (action) {
      return await action(props)
    }

    throw new Error(`Action "${String(actionName)}" not found.`)
  }
}
