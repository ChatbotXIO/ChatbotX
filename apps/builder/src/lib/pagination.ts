export const getPaginationFromInput = (input: {
  page?: number | null
  perPage?: number | null
}): { skip?: number; take?: number } => {
  const pagination: { skip?: number; take?: number } = {}
  if (input.perPage) {
    pagination.take = input.perPage
    pagination.skip = ((input.page ?? 1) - 1) * input.perPage
  }

  return pagination
}
