'use client';

import { useSSE } from '@/hooks/useSSE';
import { useQueryClient } from '@tanstack/react-query';

export function SSEStatus() {
  const queryClient = useQueryClient();

  const { connected } = useSSE({
    onMessage: (event) => {
      // Invalida os logs e os status das filas quando chega um evento novo
      queryClient.invalidateQueries({ queryKey: ['logs'] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
    },
  });

  return (
    <div className="flex items-center gap-2 bg-[#161b27] border border-gray-800 px-3 py-1.5 rounded-full">
      <span
        className={`relative flex h-3 w-3 ${connected ? 'text-green-500' : 'text-red-500'}`}
      >
        {connected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-3 w-3 ${
            connected ? 'bg-green-500' : 'bg-red-500'
          }`}
        ></span>
      </span>
      <span
        className={`text-xs font-medium ${
          connected ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {connected ? 'Conectado' : 'Desconectado'}
      </span>
    </div>
  );
}

