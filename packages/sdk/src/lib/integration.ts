import type { BaseAuthValue, Oauth2AuthValue } from "./auth"
import type { BaseConfig, HandleRequestProps, Handler } from "./shared"

export type IntegrationDefinition<
  IConfig extends BaseConfig,
  IAuth extends BaseAuthValue,
  // biome-ignore lint/suspicious/noExplicitAny: wip
  IActions extends Record<string, Handler<any, any>>,
> = {
  name: string
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
