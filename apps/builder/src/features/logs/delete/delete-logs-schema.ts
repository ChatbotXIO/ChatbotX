import { z } from "zod";

export const deleteLogSchema = z.object({
  ids: z.array(z.string().min(1)),
  chatbotId: z.string(),
});

export type DeleteLogSchema = z.infer<typeof deleteLogSchema>
