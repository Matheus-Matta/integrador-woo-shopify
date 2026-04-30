import { useState, useCallback } from 'react';
import { getWebhookStatus, syncWebhooks } from '@/services/api';
import type { WebhookResult } from '@/types';

export function useWebhooks() {
  const [results, setResults] = useState<WebhookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [domain, setDomain] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const data = await getWebhookStatus();
      setDomain(data.domain);
      const rows: WebhookResult[] = [
        ...(Array.isArray(data.shopify) ? data.shopify : []),
        ...(Array.isArray(data.woocommerce) ? data.woocommerce : []),
      ];
      setResults(rows);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const sync = useCallback(async (force = false) => {
    if (
      force &&
      !window.confirm(
        'Isso vai DELETAR todos os webhooks existentes e recriar. Continuar?'
      )
    )
      return;
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const data = await syncWebhooks(force);
      setDomain(data.domain);
      setResults(data.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createCustomWebhook = useCallback(async (platform: string, topic: string, url: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/webhooks/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, topic, url })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao criar webhook');
      
      // Reload the status to reflect the newly created webhook
      await loadStatus();
      return true;
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
      return false;
    }
  }, [loadStatus]);

  return { results, loading, error, domain, loadStatus, sync, createCustomWebhook };
}
