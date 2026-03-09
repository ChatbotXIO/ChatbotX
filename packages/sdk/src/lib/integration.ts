import type { AuthValue, Oauth2AuthValue } from "./auth"
import type {
  BaseConfig,
  Context,
  HandleRequestProps,
  Handler,
  OutgoingContact,
  OutgoingConversation,
  OutgoingMessage,
  ReceivedMessageResult,
} from "./shared"

type IChannel<IAuth extends AuthValue> = {
  message?: {
    sendMessage?: Handler<
      {
        ctx: Context<IAuth>
        data: {
          contact: OutgoingContact
          conversation: OutgoingConversation
          message: OutgoingMessage
        }
      },
      void
    >
    receiveMessage?: Handler<
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
  conversation?: {
    sendTyping?: Handler<
      {
        ctx: Context<IAuth>
        data: {
          conversation: OutgoingConversation
          typing: boolean
        }
      },
      void
    >
    contactMarkAsRead?: Handler<
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
    agentMarkAsRead?: Handler<
      {
        ctx: Context<IAuth>
        data: {
          conversation: OutgoingConversation
        }
      },
      void
    >
  }
  contact?: {
    block?: Handler<
      { ctx: Context<IAuth>; data: { contact: OutgoingContact } },
      void
    >
    unblock?: Handler<
      { ctx: Context<IAuth>; data: { contact: OutgoingContact } },
      void
    >
  }
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
