import 'server-only';

import { cache } from 'react';
import { makeQueryClient } from './query-client';

// One QueryClient per server request. `cache()` scopes it to the current render, so a
// layout and the pages inside it share prefetched data without leaking between users.
export const getServerQueryClient = cache(makeQueryClient);
