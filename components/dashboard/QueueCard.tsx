'use client';

import { useQueueStats, useInvalidateQueueStats } from '@/hooks/useQueueStats';
import { retryFailed } from '@/services/api';
import { useToast } from '@/providers/ToastProvider';
import { Spinner } from '../ui/Spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconRefresh, IconServerCog, IconRefreshAlert } from '@tabler/icons-react';

export function QueueCard() {
  const { data, isLoading, isFetching } = useQueueStats();
  const invalidate = useInvalidateQueueStats();
  const { toast } = useToast();

  const handleRetry = async (queueName: string) => {
    try {
      const res = await retryFailed(queueName);
      toast(`${res.retriedCount} job(s) reenfileirado(s)`, 'queue');
      invalidate();
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Spinner className="w-8 h-8" />
      </div>
    );
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          Nenhuma estatística disponível.
        </CardContent>
      </Card>
    );
  }

  const statsOrder = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-foreground">Status das Filas</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={invalidate}
          disabled={isFetching}
          className="gap-2"
        >
          <IconRefresh className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Object.entries(data).map(([name, q]) => (
          <Card key={name} className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <IconServerCog className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg capitalize font-semibold">{name}</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRetry(name)}
                disabled={q.failed === 0}
                className="h-8 gap-1.5 text-xs text-yellow-600 border-yellow-600/20 bg-yellow-600/10 hover:bg-yellow-600/20 hover:text-yellow-700 dark:text-yellow-500 dark:hover:text-yellow-400"
              >
                <IconRefreshAlert className="h-3.5 w-3.5" />
                Retentar falhas
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2 mt-4 text-center text-xs">
                {statsOrder.map((stat) => (
                  <div key={stat} className="flex flex-col items-center justify-center gap-1 rounded-md border bg-muted/50 p-2">
                    <p
                      className={`font-bold text-xl ${
                        stat === 'failed' && q[stat] > 0
                          ? 'text-destructive'
                          : stat === 'active' && q[stat] > 0
                          ? 'text-green-500'
                          : 'text-foreground'
                      }`}
                    >
                      {q[stat] ?? 0}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {stat === 'waiting' ? 'Fila' : stat === 'active' ? 'Ativo' : stat === 'completed' ? 'Ok' : stat === 'failed' ? 'Erro' : 'Atraso'}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
