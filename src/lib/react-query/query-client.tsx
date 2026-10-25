import { QueryClient, defaultShouldDehydrateQuery, isServer } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        // refetchOnMount: false,
        refetchOnReconnect: false,
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 5,
      },
      mutations: {
        retry: false,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

// export function getQueryClient() {
//   if (typeof window === 'undefined') {
//     return createQueryClient();
//   }

//   if (!browserQueryClient) browserQueryClient = createQueryClient();
//   return browserQueryClient;
// }

export function getQueryClient() {
  // On the server every render gets its own client so requests never share cache.
  if (isServer) return makeQueryClient();
  return (browserQueryClient ??= makeQueryClient());
}
