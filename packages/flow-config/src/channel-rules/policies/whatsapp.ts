import { stepTypes } from "../../steps/step-action"
import { waTemplateMpmLimits } from "../../steps/wa-template-mpm-rules"
import { defineChannelFlowPolicy } from "./define"
// WhatsApp Cloud API text messages allow 4,096 characters, not the 1,024-character
// limit used by some template components.

export const whatsappFlowPolicy = defineChannelFlowPolicy({
  limits: {
    buttonCount: 3,
    buttonLabel: 20,
    text: 4096,
    // `catalog_message` is an interactive message: its body is capped at 1,024
    // characters and its optional footer at 60, unlike the 4,096 of plain text.
    viewCatalog: { footer: 60, text: 1024 },
  },
  quickRepliesShareButtonSlots: true,
  supported: [
    stepTypes.enum.sendText,
    stepTypes.enum.sendImage,
    stepTypes.enum.sendMultipleImages,
    stepTypes.enum.sendCarousel,
    stepTypes.enum.sendViewCatalog,
    stepTypes.enum.sendWaTemplateMessage,
    stepTypes.enum.whatsappOptionList,
    stepTypes.enum.whatsappCallButton,
    stepTypes.enum.whatsappFlow,
    stepTypes.enum.sendProducts,
    stepTypes.enum.whatsappLocation,
  ],
  // Cloud API product messages (single/multi-product, product carousel).
  // Meta states no section cap for non-template multi-product messages, so the
  // 10-section limit is ChatbotX's own, matched to the MPM template button.
  productMessages: {
    displays: {
      products: {
        minProducts: 1,
        maxProducts: waTemplateMpmLimits.maxProductsTotal,
        maxSections: waTemplateMpmLimits.maxSections,
        header: {
          max: 60,
          allowedWhen: "multipleProducts",
          requiredWhen: "multipleProducts",
        },
        body: {
          max: 1024,
          allowedWhen: "always",
          requiredWhen: "multipleProducts",
        },
        footer: { max: 60, allowedWhen: "always", requiredWhen: "never" },
        sectionTitle: {
          max: 24,
          allowedWhen: "always",
          requiredWhen: "multipleSections",
        },
      },
      carousel: {
        minProducts: 2,
        maxProducts: 10,
        maxSections: 1,
        body: { max: 1024, allowedWhen: "always", requiredWhen: "always" },
      },
    },
  },
})
