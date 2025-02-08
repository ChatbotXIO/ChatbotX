// type ActionFunction = (...args: any[]) => Promise<any>

// interface ActionDefinition {
//   props: any
//   run: ActionFunction
//   test: ActionFunction
//   requireAuth?: boolean
//   validate?: (args: any[]) => boolean | string
// }

// Strong typing for the actions
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
export type IntegrationActions = Record<string, (props: any) => Promise<any>>
