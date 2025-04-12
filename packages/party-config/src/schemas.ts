export enum PartySocketEvent {
  CREATE_MESSAGE = "CREATE_MESSAGE",
}

export type EventData = {
  event: PartySocketEvent
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  data: any
}
