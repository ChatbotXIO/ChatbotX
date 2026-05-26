"use client"

/**
 * Wrapper do `click-to-react-component` que SÓ carrega em desenvolvimento.
 *
 * Permite que o Pedro segure **⌥ Option** (Mac) e clique em qualquer elemento
 * da UI pra abrir o arquivo React correspondente direto no Cursor, com o
 * cursor posicionado na linha exata. Pra ajustes finos de espaçamento, cor,
 * etc, basta clicar e pedir "mova 4px pra cima" no chat do Cursor.
 *
 * Em produção, retorna `null` e o `dynamic({ ssr: false })` impede que o pkg
 * seja incluído no bundle.
 */

import dynamic from "next/dynamic"

const ClickToComponent = dynamic(
  () =>
    import("click-to-react-component").then((mod) => ({
      default: mod.ClickToComponent,
    })),
  { ssr: false },
)

export function DevClickToComponent() {
  if (process.env.NODE_ENV !== "development") {
    return null
  }
  // editor="cursor" → abre via cursor:// protocol; configurado por padrão no Cursor.
  return <ClickToComponent editor="cursor" />
}
