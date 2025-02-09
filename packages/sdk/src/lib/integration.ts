import { z } from "zod"
import type { IntegrationActions } from "./action"
import type { AuthSchema } from "./auth"
import type { IntegrationChannels } from "./channel"

const integrationPropsSchema = z.object({
  name: z.string().trim().min(1),
})

type Handler<I, O> = (props: I) => Promise<O>

type IntegrationProps<AuthInput> = {
  name: string
  actions?: IntegrationActions
  channels?: IntegrationChannels
  authorize?: Handler<AuthInput & { code: string }, AuthSchema>
  connect?: Handler<AuthInput, string>
  disconnect?: Handler<AuthInput, boolean>
}

export class Integration<AuthInput> {
  private readonly _name: string
  private readonly _actions: IntegrationActions
  private readonly _channels: IntegrationChannels
  private readonly _authorize?: Handler<
    AuthInput & { code: string },
    AuthSchema
  >
  private readonly _connect?: Handler<AuthInput, string>
  private readonly _disconnect?: Handler<AuthInput, boolean>

  constructor(props: IntegrationProps<AuthInput>) {
    this.validateProps(props)

    this._name = props.name
    this._actions = props.actions || {}
    this._channels = props.channels || {}
    this._authorize = props.authorize
    this._connect = props.connect
    this._disconnect = props.disconnect
  }

  private validateProps(props: IntegrationProps<AuthInput>) {
    integrationPropsSchema.parse(props)
  }

  get name(): string {
    return this._name
  }

  get actions(): IntegrationActions {
    return this._actions
  }

  get channels(): IntegrationChannels {
    return this._channels
  }

  get authorize() {
    return this._authorize
  }

  get connect() {
    return this._connect
  }

  get disconnect() {
    return this._disconnect
  }
}
