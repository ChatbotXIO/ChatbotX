import z from "zod"

export const zaloUserProfileSchema = z.object({
  error: z.number(), // 0 = success, khác 0 = lỗi
  message: z.string(),
  data: z
    .object({
      user_id: z.string(),
      display_name: z.string().optional(),
      avatar: z.string().url().optional(),
      user_gender: z.enum(["male", "female"]).optional(),
      shared_info: z
        .object({
          phone: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
})

export type ZaloUserProfile = z.infer<typeof zaloUserProfileSchema>
