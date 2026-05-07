'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/Spinner';
import {
  IconClock,
  IconRefresh,
  IconPlayerPlay,
  IconPlayerStop,
  IconInfoCircle,
  IconChecks,
  IconAlertTriangle,
  IconDatabaseExport,
  IconRocket,
} from '@tabler/icons-react';
import { toast } from 'sonner';

interface SchedulerConfig {
  active: boolean;
  intervalMs: number;
  lookbackHours: number;
  productDailySync: {
    active: boolean;
    hour: number;
    minute: number;
  };
}

const MS_IN_MINUTE = 60_000;

function msToMinutes(ms: number) {
  return Math.round(ms / MS_IN_MINUTE);
}

export default function SchedulerSettingsPage() {
  const [config, setConfig] = useState<SchedulerConfig | null>(null);
  const [form, setForm] = useState({
    active: true,
    intervalMinutes: 30,
    lookbackHours: 2,
    productDailyActive: true,
    productDailyHour: 3,
    productDailyMinute: 0,
  });
  const [triggering, setTriggering] = useState<'orders' | 'products' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/scheduler');
      const data: SchedulerConfig = await res.json();
      setConfig(data);
      setForm({
        active: data.active,
        intervalMinutes: msToMinutes(data.intervalMs),
        lookbackHours: data.lookbackHours,
        productDailyActive: data.productDailySync?.active ?? true,
        productDailyHour: data.productDailySync?.hour ?? 3,
        productDailyMinute: data.productDailySync?.minute ?? 0,
      });
    } catch {
      setError('Não foi possível carregar a configuração do scheduler.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const res = await fetch('/api/dashboard/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: form.active,
          intervalMs: form.intervalMinutes * MS_IN_MINUTE,
          lookbackHours: form.lookbackHours,
          productDailySync: {
            active: form.productDailyActive,
            hour: form.productDailyHour,
            minute: form.productDailyMinute,
          }
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro ao salvar');
      setConfig(data.scheduler);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (active: boolean) => {
    setForm((f) => ({ ...f, active }));
    setSaving(true);
    setError('');
    try {
      await fetch('/api/dashboard/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active,
          intervalMs: form.intervalMinutes * MS_IN_MINUTE,
          lookbackHours: form.lookbackHours,
        }),
      });
      setConfig((c) => c ? { ...c, active } : c);
    } catch {
      setError('Falha ao alternar o status do scheduler.');
      setForm((f) => ({ ...f, active: !active })); // rollback
    } finally {
      setSaving(false);
    }
  };

  const handleTrigger = async (type: 'orders' | 'products') => {
    const label = type === 'orders' ? 'Sincronização de Pedidos' : 'Sincronização Diária de Produtos';
    const confirmMessage = `Deseja disparar a ${label} agora? Esta operação pode levar alguns minutos e será executada em segundo plano.`;
    
    if (!window.confirm(confirmMessage)) return;

    setTriggering(type);
    try {
      const res = await fetch('/api/dashboard/scheduler/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Erro ao disparar');
      toast.success(data.message || 'Sincronização iniciada!');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTriggering(null);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
          <IconClock className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Scheduler de Sincronização</h1>
          <p className="text-sm text-muted-foreground">Controle a auditoria automática de pedidos e produtos</p>
        </div>
      </div>

      {/* Info card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex gap-3">
          <IconInfoCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-foreground/80 space-y-1">
            <p className="font-medium text-foreground">Como funciona a auditoria?</p>
            <p>
              O scheduler roda em segundo plano a cada <strong>{form.intervalMinutes} minuto(s)</strong>, buscando os pedidos e produtos mais recentes nas últimas <strong>{form.lookbackHours} hora(s)</strong> para comparar se Shopify e WooCommerce estão sincronizados.
            </p>
            <p className="text-muted-foreground">
              Se um pedido ou produto estiver divergente, ele é automaticamente re-enfileirado para sincronização — sem intervenção manual.
            </p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Status do Scheduler
                {config?.active ? (
                  <Badge variant="secondary" className="gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-950/50">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                    Ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-xs font-semibold text-muted-foreground border-dashed">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" />
                    Inativo
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Ative ou desative a auditoria automática em tempo real.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Switch
                  checked={form.active}
                  onCheckedChange={(checked) => handleToggle(checked)}
                  disabled={saving}
                  size="default"
                />
                <div className="flex items-center gap-2">
                  {form.active ? (
                    <>
                      <IconPlayerPlay className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                        Scheduler ligado — auditando a cada {form.intervalMinutes} minuto(s)
                      </span>
                    </>
                  ) : (
                    <>
                      <IconPlayerStop className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Scheduler desligado — nenhuma auditoria automática em execução
                      </span>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Global Configs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ciclo de Auditoria</CardTitle>
              <CardDescription>
                Configure a frequência e o alcance da verificação automática de pedidos e produtos.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="intervalMinutes">Intervalo entre ciclos (minutos)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="intervalMinutes"
                    type="number"
                    min={1}
                    value={form.intervalMinutes}
                    onChange={(e) => setForm(f => ({ ...f, intervalMinutes: Number(e.target.value) }))}
                  />
                  <Badge variant="outline" className="whitespace-nowrap">
                    {Math.round(1440 / (form.intervalMinutes || 1))} vezes/dia
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="lookbackHours">Janela de Auditoria (horas atrás)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="lookbackHours"
                    type="number"
                    min={1}
                    max={168}
                    value={form.lookbackHours}
                    onChange={(e) => setForm(f => ({ ...f, lookbackHours: Number(e.target.value) }))}
                  />
                  <Badge variant="outline" className="whitespace-nowrap">
                    Alcance de {form.lookbackHours}h
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily Product Sync */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                Sincronização Diária de Produtos (Full)
                <Switch
                  checked={form.productDailyActive}
                  onCheckedChange={(checked) => setForm(f => ({ ...f, productDailyActive: checked }))}
                  disabled={saving}
                />
              </CardTitle>
              <CardDescription>
                Compara Título, Preço e Estoque de todos os produtos uma vez ao dia.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="productDailyHour">Hora de execução (0-23)</Label>
                <Input
                  id="productDailyHour"
                  type="number"
                  min={0}
                  max={23}
                  value={form.productDailyHour}
                  onChange={(e) => setForm(f => ({ ...f, productDailyHour: Number(e.target.value) }))}
                  disabled={!form.productDailyActive}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="productDailyMinute">Minuto de execução (0-59)</Label>
                <Input
                  id="productDailyMinute"
                  type="number"
                  min={0}
                  max={59}
                  value={form.productDailyMinute}
                  onChange={(e) => setForm(f => ({ ...f, productDailyMinute: Number(e.target.value) }))}
                  disabled={!form.productDailyActive}
                />
              </div>
            </CardContent>
          </Card>

          {/* Manual Triggers */}
          <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/10">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <IconRocket className="h-4 w-4 text-emerald-600" />
                Ações Manuais
              </CardTitle>
              <CardDescription>
                Dispare os processos de auditoria imediatamente sem esperar o próximo ciclo.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <Button
                type="button"
                variant="outline"
                className="border-emerald-200 hover:bg-emerald-100 dark:border-emerald-800 dark:hover:bg-emerald-900/30 gap-2"
                onClick={() => handleTrigger('orders')}
                disabled={triggering !== null}
              >
                {triggering === 'orders' ? <Spinner className="h-4 w-4" /> : <IconRefresh className="h-4 w-4 text-emerald-600" />}
                Sincronizar Pedidos Recentes
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-emerald-200 hover:bg-emerald-100 dark:border-emerald-800 dark:hover:bg-emerald-900/30 gap-2"
                onClick={() => handleTrigger('products')}
                disabled={triggering !== null}
              >
                {triggering === 'products' ? <Spinner className="h-4 w-4" /> : <IconDatabaseExport className="h-4 w-4 text-emerald-600" />}
                Sincronizar Todos os Produtos
              </Button>
            </CardContent>
          </Card>

          {/* Summary & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="rounded-lg border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground space-y-0.5">
              <p>
                <span className="font-medium text-foreground">Resumo:</span>{' '}
                {form.active
                  ? `Audita a cada ${form.intervalMinutes} min · olha para as últimas ${form.lookbackHours}h`
                  : 'Auditoria automática desabilitada'}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={fetchConfig}
                disabled={loading || saving}
                className="gap-2"
              >
                <IconRefresh className="h-4 w-4" />
                Recarregar
              </Button>
              <Button type="submit" disabled={saving} className="gap-2 min-w-[140px]">
                {saving ? (
                  <Spinner className="h-4 w-4 text-primary-foreground" />
                ) : saved ? (
                  <>
                    <IconChecks className="h-4 w-4" />
                    Salvo!
                  </>
                ) : (
                  <>
                    <IconClock className="h-4 w-4" />
                    Salvar Configurações
                  </>
                )}
              </Button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
              <IconAlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
