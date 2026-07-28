import { Body, Button, Footer, Row } from "whatsapp-api-js/messages"
import { clampText, messageLimits } from "./message-limits"

export function generateButton({ id, title }: { id: string; title: string }) {
  return new Button(
    clampText(id, messageLimits.buttonId),
    clampText(title, messageLimits.buttonTitle),
  )
}

export function generateRow({ id, title }: { id: string; title: string }) {
  return new Row(
    clampText(id, messageLimits.rowId),
    clampText(title, messageLimits.rowTitle),
  )
}

export function generateBody(text: string) {
  return new Body(clampText(text, messageLimits.bodyText))
}

export function generateFooter(text: string) {
  return new Footer(clampText(text, messageLimits.footerText))
}
