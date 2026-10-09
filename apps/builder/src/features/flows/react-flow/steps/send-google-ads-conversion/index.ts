import {
  type SendGoogleAdsConversionSchema,
  sendGoogleAdsConversionDefaultFn,
  sendGoogleAdsConversionSchema,
} from "@chatbotx.io/flow-config"
import type { StepDefinition } from "../definition"
import { SendGoogleAdsConversionEditor } from "./editor"
import SendGoogleAdsConversionViewer from "./viewer"

export const sendGoogleAdsConversionStep: StepDefinition<SendGoogleAdsConversionSchema> =
  {
    editor: SendGoogleAdsConversionEditor,
    viewer: SendGoogleAdsConversionViewer,
    validator: sendGoogleAdsConversionSchema,
    defaultFn: sendGoogleAdsConversionDefaultFn,
  }
