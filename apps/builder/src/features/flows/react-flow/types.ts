export enum PanelAction {
  SendMessage = "SendMessage",
  StartFlow = "StartFlow",
  Actions = "Actions",
  Condition = "Condition",
  SendMail = "SendMail",
  SplitTraffic = "SplitTraffic",
  Wait = "Wait",
  LandingPage = "LandingPage",
  AddNotes = "AddNotes",
}

export type PanelActionKey = keyof typeof PanelAction
