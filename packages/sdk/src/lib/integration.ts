import type { BaseAuthValue } from "./auth"
import type { BaseConfig, Context, HandleRequestProps, Handler } from "./shared"

export type IntegrationActionPropsSchema<AO extends BaseAuthValue> = {
  ctx: Context<AO>
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  props: any
}

export type IntegrationActions<AO extends BaseAuthValue> = Record<
  string,
  Handler<IntegrationActionPropsSchema<AO>, unknown>
>

export type IntegrationHandlerProps<AO extends BaseAuthValue> = {
  ctx: Context<AO>
  req: Request
  queue: {
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    add: (name: string, data: any, opts?: any) => Promise<any>
  }
}

export type IntegrationDefinition<
  IAuth extends BaseAuthValue,
  IConfig extends BaseConfig,
> = {
  name: string
  actions?: {
    [key: string]: (props: {
      ctx: Context<IAuth>
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    }) => Promise<any>
  }
  handleRequest?: Handler<HandleRequestProps<IConfig>, string | number>
}

export class Integration<
  IAuth extends BaseAuthValue,
  IConfig extends BaseConfig,
  T extends IntegrationDefinition<IAuth, IConfig>,
> {
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

  // get authorize(): Handler<AI, AO> | undefined {
  //   return this.props.authorize;
  // }

  // get connect(): Handler<AI, string> | undefined {
  //   return this.props.connect;
  // }

  // get disconnect(): Handler<AO, boolean> | undefined {
  //   return this.props.disconnect;
  // }

  get handleRequest(): T["handleRequest"] {
    return this.props.handleRequest
  }
}
