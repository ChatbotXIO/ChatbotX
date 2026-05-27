import { z } from "zod"

// Schema separado por quirk Next 16 standalone — não inline em "use server".
// Variáveis `{{1}}`, `{{2}}` etc do template HSM passam por aqui já preenchidas
// pelo agente; backend roda `replaceWhatsappTemplateVariables` (worker) caso
// queira interpolar com dados do contact, mas pra envio manual do composer
// o agente preenche manualmente.
export const sendWhatsappTemplateRequest = z.object({
  templateId: z.string(),
  variables: z.array(z.string()).optional(),
})
export type SendWhatsappTemplateRequest = z.infer<
  typeof sendWhatsappTemplateRequest
>
