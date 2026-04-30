import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getQueueStats } from '@/services/api';
import type { QueueStatsResponse } from '@/types';

export function useQueueStats() {
  return useQuery<QueueStatsResponse>({
    queryKey: ['queue-stats'],
    queryFn: getQueueStats,
    refetchInterval: 30_000,
  });
}

export function useInvalidateQueueStats() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['queue-stats'] });
}
