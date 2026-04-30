'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsEvent } from '@/types';

const SSE_URL = '/api/dashboard/events';

interface UseSSEOptions {
  onMessage?: (event: WsEvent) => void;
}

export function useSSE({ onMessage }: UseSSEOptions = {}) {
  const [connected, setConnected] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!SSE_URL) return;

    const sse = new EventSource(SSE_URL);
    sseRef.current = sse;

    sse.onopen = () => setConnected(true);

    sse.onmessage = (evt) => {
      try {
        const ev = JSON.parse(evt.data as string) as WsEvent;
        onMessageRef.current?.(ev);
      } catch {
        // ignora mensagens malformadas
      }
    };

    sse.onerror = () => {
      setConnected(false);
      sse.close();
      reconnectTimer.current = setTimeout(connect, 5000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      sseRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
