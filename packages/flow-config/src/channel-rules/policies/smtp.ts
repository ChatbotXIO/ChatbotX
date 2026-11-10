import { stepTypes } from "../../steps/step-action"
import { defineChannelFlowPolicy } from "./define"
// SMTP sends plain-text email from the inbox and from `sendText` flow steps.
// Email has no interactive controls: a postback button would be delivered as a
// dead end, so `sendText` is `noButtons` (publish rejects buttons on it, and the
// inbox does not offer the booking-link/flow-with-buttons entries). Other step
// kinds have no email rendering and stay unsupported: blocked at publish/import
// and hidden from the editor menu. The dedicated `email` step (a worker action)
// is independent of this list.

export const smtpFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 6000,
  },
  noButtons: [stepTypes.enum.sendText],
})
