import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getLogs, getEntityLogs, getEntityDetail } from '@/services/api';
import type { 
  LogsFilters, 
  LogsResponse, 
  LogEntitiesResponse, 
  LogEntityDetail 
} from '@/types';

export function useLogs(filters: LogsFilters) {
  return useQuery<LogsResponse>({
    queryKey: ['logs', filters],
    queryFn: () => getLogs(filters),
    placeholderData: (prev) => prev,
  });
}

export function useEntityLogs(filters: LogsFilters) {
  return useQuery<LogEntitiesResponse>({
    queryKey: ['logs-entities', filters],
    queryFn: () => getEntityLogs(filters),
    placeholderData: (prev) => prev,
  });
}

export function useEntityDetail(
  type: string,
  id: string,
  opts?: { eventsPage?: number; errorsPage?: number; limitEvents?: number; limitErrors?: number },
) {
  const ePage = opts?.eventsPage ?? 1;
  const erPage = opts?.errorsPage ?? 1;
  const lE = opts?.limitEvents ?? 50;
  const lEr = opts?.limitErrors ?? 50;
  return useQuery<LogEntityDetail>({
    queryKey: ['log-entity', type, id, ePage, erPage, lE, lEr],
    queryFn: () => getEntityDetail(type, id, ePage, lE, erPage, lEr),
    enabled: !!id,
  });
}

export function useInvalidateLogs(type: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['logs', { type }] });
    qc.invalidateQueries({ queryKey: ['logs-entities', { type }] });
  };
}

