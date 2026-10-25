'use client';

import { useQuery } from '@tanstack/react-query';
import { meQueryOptions } from '@/lib/react-query/queries/auth';

export const useMe = () => useQuery(meQueryOptions);
