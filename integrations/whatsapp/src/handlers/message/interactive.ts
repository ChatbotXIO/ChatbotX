import { Body, Button, Footer } from "whatsapp-api-js/messages"

const ID_MAX_LENGTH = 256
const TITLE_MAX_LENGTH = 20
const BODY_MAX_LENGTH = 1024
const FOOTER_MAX_LENGTH = 60

export function generateButton({ id, title }: { id: string; title: string }) {
  return new Button(
    id.slice(0, ID_MAX_LENGTH),
    title.slice(0, TITLE_MAX_LENGTH),
  )
}

export function generateBody(text: string) {
  return new Body(text.slice(0, BODY_MAX_LENGTH))
}

export function generateFooter(text: string) {
  return new Footer(text.slice(0, FOOTER_MAX_LENGTH))
}
