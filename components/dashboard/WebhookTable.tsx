'use client';

import { useState } from 'react';
import { useWebhooks } from '@/hooks/useWebhooks';
import { useToast } from '@/providers/ToastProvider';
import { Spinner } from '../ui/Spinner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  IconWebhook,
  IconSearch,
  IconRefresh,
  IconAlertTriangle,
  IconApiApp,
  IconPlus,
} from '@tabler/icons-react';

export function WebhookTable() {
  const { results, loading, error, domain, loadStatus, sync, createCustomWebhook } = useWebhooks();
  const { toast } = useToast();

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    platform: 'shopify',
    topic: '',
    url: '',
  });

  const handleSync = async (force: boolean) => {
    await sync(force);
    if (!force) toast('Sincronização concluída', 'ok');
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.topic || !formData.url) {
      toast('Preencha o tópico e a URL', 'error');
      return;
    }
    setCreating(true);
    const success = await createCustomWebhook(formData.platform, formData.topic, formData.url);
    setCreating(false);
    if (success) {
      toast('Webhook criado com sucesso!', 'ok');
      setIsSheetOpen(false);
      setFormData({ platform: 'shopify', topic: '', url: '' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <IconWebhook className="h-6 w-6 text-primary" />
          Sincronização de Webhooks
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={loadStatus}
            disabled={loading}
            className="gap-2"
          >
            <IconSearch className="h-4 w-4" />
            Verificar status
          </Button>
          <Button
            onClick={() => handleSync(false)}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Spinner className="h-4 w-4 mr-1 text-primary-foreground" />
            ) : (
              <IconRefresh className="h-4 w-4" />
            )}
            Sincronizar agora
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleSync(true)}
            disabled={loading}
            title="Deleta todos os webhooks existentes e recria do zero"
            className="gap-2"
          >
            <IconAlertTriangle className="h-4 w-4" />
            Forçar Recriação
          </Button>

          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger
              className={cn(
                buttonVariants({ variant: 'default' }),
                'gap-2 bg-zinc-800 hover:bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200'
              )}
            >
              <IconPlus className="h-4 w-4" />
              Adicionar Webhook
            </SheetTrigger>
            <SheetContent className="flex flex-col sm:max-w-xl p-6">
              <SheetHeader className="px-1">
                <SheetTitle>Criar Novo Webhook</SheetTitle>
                <SheetDescription>
                  Adicione um webhook personalizado diretamente na plataforma desejada.
                </SheetDescription>
              </SheetHeader>
              <form onSubmit={handleCreate} className="flex flex-col gap-6 mt-2 flex-1 px-1">
                <div className="flex flex-col gap-3">
                  <Label>Plataforma</Label>
                  <Select
                    value={formData.platform}
                    onValueChange={(val) => val && setFormData({ ...formData, platform: val })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a plataforma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shopify">Shopify</SelectItem>
                      <SelectItem value="woocommerce">WooCommerce</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex flex-col gap-3">
                  <Label>Tópico</Label>
                  <Input
                    placeholder="Ex: orders/create ou order.updated"
                    value={formData.topic}
                    onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground">O formato do tópico depende da plataforma selecionada.</span>
                </div>

                <div className="flex flex-col gap-3">
                  <Label>URL de Destino (Endpoint)</Label>
                  <Input
                    type="url"
                    placeholder="https://sua-api.com/webhook"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  />
                </div>

                <div className="mt-auto flex justify-end gap-2 border-t pt-4">
                  <Button type="button" variant="ghost" onClick={() => setIsSheetOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? <Spinner className="h-4 w-4 mr-2" /> : null}
                    Criar Webhook
                  </Button>
                </div>
              </form>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col gap-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Domínio do integrador <span className="normal-case font-normal">(variável DOMAIN no .env)</span>
          </label>
          <div
            className={`rounded-md border px-4 py-2.5 font-mono text-sm truncate ${
              domain ? 'text-primary bg-primary/5 border-primary/20' : 'text-destructive bg-destructive/5 border-destructive/20'
            }`}
          >
            {domain || 'Não configurado — defina DOMAIN no arquivo .env do backend'}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 flex items-start gap-3">
          <IconAlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <Card className="overflow-hidden border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plataforma</TableHead>
                  <TableHead>Tópico</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => (
                  <TableRow key={i} className="hover:bg-muted/50">
                    <TableCell className="font-medium capitalize flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          r.platform === 'shopify' ? 'bg-[#95bf47]' : 'bg-[#96588a]'
                        }`}
                      ></span>
                      {r.platform}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-primary">{r.topic}</TableCell>
                    <TableCell
                      className="text-xs truncate max-w-[300px] text-muted-foreground"
                      title={r.registeredUrl || r.endpoint}
                    >
                      {(r.registeredUrl || r.endpoint)?.replace(/^https?:\/\/[^/]+/, '')}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const isSuccess = r.status === 'ok' || r.exists === true || r.status === 'created';
                        const isError = r.status === 'error' || r.exists === false;
                        
                        let variant: "default" | "destructive" | "secondary" | "outline" = "default";
                        if (isSuccess) variant = "secondary";
                        else if (isError) variant = "destructive";
                        else variant = "outline";

                        let label = 'Ausente';
                        if (r.status === 'created') label = 'Criado';
                        else if (r.status === 'ok' || r.exists) label = 'Ativo';
                        else if (r.status === 'error') label = 'Erro';

                        return (
                          <Badge variant={variant} className="gap-1 px-2 py-0.5 text-[10px] uppercase font-semibold">
                            {label}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {r.isCustom ? (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
                          CUSTOM
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] opacity-70">
                          SISTEMA
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {r.id ?? r.error ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {results.length === 0 && !loading && !error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <IconApiApp className="h-12 w-12 mb-4 opacity-50" />
            <p>Clique em "Verificar status" ou "Sincronizar agora" para começar.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
