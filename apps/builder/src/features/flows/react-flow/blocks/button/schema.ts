import { z } from 'zod';

export const NodeBlockButtonSchema = z.object({
  id: z.string(),
  label: z.string(),
});
