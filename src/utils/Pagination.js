/**
 * Parse pagination parameters from query string and calculate database range limits.
 * @param {object} queryParams Express request query parameters
 * @returns {{page: number, limit: number, from: number, to: number}} Pagination parameters
 */
const getPaginationParams = (queryParams) => {
  const page = parseInt(queryParams?.page) || 1;
  const limit = parseInt(queryParams?.limit) || 10;
  const from = (page - 1) * limit;
  const to = page * limit - 1;
  return { page, limit, from, to };
};

/**
 * Construct a standard pagination metadata object.
 * @param {number} page Current page number
 * @param {number} limit Page limit size
 * @param {number} totalDocs Total number of records
 * @returns {{page: number, limit: number, totalDocs: number, totalPages: number, hasNextPage: boolean, hasPrevPage: boolean}} Pagination metadata
 */
const buildPagination = (page, limit, totalDocs) => {
  const totalPages = Math.ceil(totalDocs / limit) || 0;
  return {
    page,
    limit,
    totalDocs,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

export { getPaginationParams, buildPagination };
