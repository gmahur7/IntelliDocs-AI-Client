import { queryOptions } from '@tanstack/react-query';
import http from '@/lib/http';
import { authQueryKeys } from '@/lib/react-query/query-keys';
import type { ApiSuccess } from '@/types/api/api';
import type { User } from '@/types/api/auth';

export const meQueryOptions = queryOptions({
  queryKey: authQueryKeys.me(),
  queryFn: async () => {
    // Goes through the BFF (/api/auth/me). The interceptor rejects isSuccess:false,
    // so a resolved response is always a success envelope.
    const { data } = await http.get<ApiSuccess<{ user: User }>>('/auth/me');
    return data.data.user;
  },
});
