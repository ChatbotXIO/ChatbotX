import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// Schema permissivo do form do CloseConversationDialog: deixa categoryId e
// summary opcionais. A obrigatoriedade contextual por modo é imposta
// SERVER-SIDE (closeConversationWithNoteAction → ChatbotXException) e
// reforçada visualmente via `disabled` no botão de confirmar.
//
// Por que opcional aqui? useHookFormAction tipa defaultValues por inferência
// do Zod; deixar campos required-with-undefined gera incompatibilidade
// com defaultValues que omitem a chave.
//
// Note: arquivo separado por causa do Next 16 standalone "use server" quirk
// (schemas Zod não podem ficar em files marcados "use server").
export const closeConversationWithNoteFormSchema = z.object({
  conversationId: zodBigintAsString(),
  categoryId: zodBigintAsString().optional(),
  summary: z.string().trim().max(2000).optional(),
})

export type CloseConversationWithNoteFormValues = z.infer<
  typeof closeConversationWithNoteFormSchema
>
