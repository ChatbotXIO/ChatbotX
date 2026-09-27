import { QueryClient } from "@tanstack/react-query"

export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
