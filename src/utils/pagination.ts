/**
 * Utilitaires de pagination
 */

export interface PaginationQuery {
  page?: string;
  limit?: string;
  offset?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export function getPagination(query: PaginationQuery, maxLimit = 250): PaginationParams {
  const page = parseInt(query.page || "1");
  const limit = Math.min(parseInt(query.limit || "50"), maxLimit);
  const offset = query.offset ? parseInt(query.offset) : (page - 1) * limit;
  return { page, limit, offset };
}

export function createPaginationResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
) {
  return {
    data,
    pagination: {
      total,
      page: params.page,
      limit: params.limit,
      pages: Math.ceil(total / params.limit),
    },
  };
}
