// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
import type { MiniAppDefinition } from "../src/types"

/** Two screens: collect a name, then confirm and complete. */
export const twoScreenDefinition = (): MiniAppDefinition => ({
  screens: [
    {
      key: "s_welcome",
      id: "WELCOME",
      title: "Welcome",
      terminal: false,
      children: [
        {
          id: "n_heading",
          type: "TextHeading",
          props: { text: "Book a visit" },
        },
        {
          id: "n_name",
          type: "TextInput",
          props: {
            name: "full_name",
            label: "Full name",
            "input-type": "text",
            required: true,
            "helper-text": "",
          },
        },
        {
          id: "n_next",
          type: "Footer",
          props: {
            label: "Continue",
            "on-click-action": { name: "navigate", next: "s_confirm" },
          },
        },
      ],
    },
    {
      key: "s_confirm",
      id: "CONFIRM",
      title: "Confirm",
      terminal: true,
      children: [
        {
          id: "n_body",
          type: "TextBody",
          props: { text: "Thanks ${screen.WELCOME.form.full_name}" },
        },
        {
          id: "n_terms",
          type: "OptIn",
          props: { name: "terms", label: "I agree", required: true },
        },
        {
          id: "n_done",
          type: "Footer",
          props: { label: "Submit", "on-click-action": { name: "complete" } },
        },
      ],
    },
  ],
})

/** The Flow JSON `twoScreenDefinition` must serialize to. */
export const twoScreenFlowJson = {
  version: "7.3",
  screens: [
    {
      id: "WELCOME",
      title: "Welcome",
      layout: {
        type: "SingleColumnLayout",
        children: [
          { type: "TextHeading", text: "Book a visit" },
          {
            type: "TextInput",
            name: "full_name",
            label: "Full name",
            "input-type": "text",
            required: true,
          },
          {
            type: "Footer",
            label: "Continue",
            "on-click-action": {
              name: "navigate",
              next: { type: "screen", name: "CONFIRM" },
              payload: {},
            },
          },
        ],
      },
    },
    {
      id: "CONFIRM",
      title: "Confirm",
      terminal: true,
      success: true,
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "TextBody",
            text: "`'Thanks ' ${screen.WELCOME.form.full_name}`",
          },
          { type: "OptIn", name: "terms", label: "I agree", required: true },
          {
            type: "Footer",
            label: "Submit",
            "on-click-action": {
              name: "complete",
              payload: {
                full_name: "${screen.WELCOME.form.full_name}",
                terms: "${form.terms}",
              },
            },
          },
        ],
      },
    },
  ],
}
