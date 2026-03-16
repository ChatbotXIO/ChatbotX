const notFound = {
  message: "Resource not found",
  status: 404,
}

const rateLimitExceeded = {
  message: "Rate limit exceeded",
  status: 429,
}

const invalidRequestData = {
  message: "Validation error",
  status: 422,
}

const businessError = {
  message: "An error occurred while processing your request",
  status: 400,
}

export const posibleErrorsOnFindingResource = {
  rateLimitExceeded,
  notFound,
  businessError,
}

export const posibleErrorsOnListingResource = {
  rateLimitExceeded,
  businessError,
}

export const posibleErrorsOnCreatingResource = {
  rateLimitExceeded,
  invalidRequestData,
  businessError,
}

export const posibleErrorsOnUpdatingResource = {
  rateLimitExceeded,
  invalidRequestData,
  businessError,
}

export const posibleErrorsOnDeletingResource = {
  rateLimitExceeded,
  businessError,
}
