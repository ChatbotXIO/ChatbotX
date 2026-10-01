import { defineChannelFlowPolicy } from "./define"
// SMTP has no sendFlowStep/sendMessage channel handler (`integrations/smtp`
// registers `channels.channel.message: {}`): delivery only ever happens
// through the dedicated `email` step (a worker action, always `full` by
// default), never through a sendMessage node's channel-kind steps. Keeping
// `supported` empty — like `threadsFlowPolicy` — blocks publish/import and
// hides sendText/sendImage/etc. from the editor's SMTP menu instead of
// authoring a step that would throw in `sendFlowStepToChannel` at send time.

export const smtpFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 6000,
  },
})
