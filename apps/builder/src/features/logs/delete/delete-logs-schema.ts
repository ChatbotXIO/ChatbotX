import { z } from "zod";

export const deleteLogSchema = z.object({
  ids: z.array(z.string()),
  chatbotId: z.string(),
});
