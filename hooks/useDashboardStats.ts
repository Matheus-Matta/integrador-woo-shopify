import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '@/services/api';
import type { DashboardStatsResponse } from '@/types';

export function useDashboardStats() {
  return useQuery<DashboardStatsResponse>({
    queryKey: ['dashboard-stats'],
    queryFn: () => getDashboardStats(30),
    refetchInterval: 60_000,  // atualiza a cada 1 minuto
    staleTime:       30_000,
  });
}
