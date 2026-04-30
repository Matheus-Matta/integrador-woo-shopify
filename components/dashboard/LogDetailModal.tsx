'use client';

import { useEffect } from 'react';
import type { LogRow } from '@/types';
import { useToast } from '@/providers/ToastProvider';
import { translateAction } from '@/lib/utils/action-translator';
import { IconX, IconCopy, IconCode } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';

interface LogDetailModalProps {
  row: LogRow | null;
  onClose: () => void;
  type: string;
}

export function LogDetailModal({ row, onClose, type }: LogDetailModalProps) {
  const { toast } = useToast();

  // Fecha modal com a tecla ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!row) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => toast('Copiado!', 'ok'));
  };

  const fmtDate = (val?: string) => {
    if (!val) return '';
    const d = new Date(val);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  const getSubtitle = () => {
    if ('action' in row && row.action) return row.action;
    if ('flow' in row && row.flow) return row.flow;
    return '';
  };

  const getIdentifier = () => {
    if ('shopify_order_id' in row && row.shopify_order_id) return `Pedido #${row.shopify_order_id}`;
    if ('email' in row && row.email) return row.email;
    if ('sku' in row && row.sku) return `SKU ${row.sku}`;
    return '';
  };

  const sections: { label: string; json: string }[] = [];
  const fmt = (v: unknown) => (v !== undefined && v !== null ? JSON.stringify(v, null, 2) : null);

  if (type === 'product') {
    const r = row as any;
    if (r.before != null) sections.push({ label: 'Antes (dados originais)', json: fmt(r.before)! });
    if (r.after != null) sections.push({ label: 'Depois (enviado ao Shopify)', json: fmt(r.after)! });
    if (r.shopify_response != null) sections.push({ label: 'Resposta do Shopify', json: fmt(r.shopify_response)! });
  } else if (type === 'order' || type === 'customer') {
    const r = row as any;
    const webhookFallback = { note: 'Nenhum dado de webhook disponível para este evento' };
    sections.push({ label: 'Dados do Webhook (entrada)', json: fmt(r.webhook ?? webhookFallback)! });
    if (r.payload != null) sections.push({ label: 'Dados enviados ao WooCommerce', json: fmt(r.payload)! });
    if (r.response != null) sections.push({ label: 'Resposta do WooCommerce', json: fmt(r.response)! });
  } else if (type === 'error') {
    const r = row as any;
    if (r.payload != null) sections.push({ label: 'Payload que causou o erro', json: fmt(r.payload)! });
    if (r.stack != null) sections.push({ label: 'Stack trace', json: typeof r.stack === 'string' ? r.stack : fmt(r.stack)! });
  }

  const buildFullLogText = () => {
    const lines: string[] = [];
    // Cabeçalho
    lines.push('=== Log completo ===');
    if ((row as any)?.timestamp) lines.push(`Data/Hora: ${fmtDate((row as any).timestamp)}`);
    const subtitle = getSubtitle();
    if (subtitle) lines.push(`Ação/Fluxo: ${translateAction(subtitle)}`);
    const ident = getIdentifier();
    if (ident) lines.push(`Entidade: ${ident}`);
    lines.push(`Tipo de registro: ${type}`);
    lines.push('');

    // Campos importantes do registro raiz
    const root = row as any;
    const rootSummary: Record<string, unknown> = {};
    if (root.shopify_order_id) rootSummary.shopify_order_id = root.shopify_order_id;
    if (root.shopify_order_name) rootSummary.shopify_order_name = root.shopify_order_name;
    if (root.woo_order_id) rootSummary.woo_order_id = root.woo_order_id;
    if (root.email) rootSummary.email = root.email;
    if (root.sku) rootSummary.sku = root.sku;
    if (root.flow) rootSummary.flow = root.flow;
    if (root.error_message) rootSummary.error_message = root.error_message;
    if (Object.keys(rootSummary).length > 0) {
      lines.push('--- Resumo do registro ---');
      lines.push(JSON.stringify(rootSummary, null, 2));
      lines.push('');
    }

    // Seções detalhadas
    for (const sec of sections) {
      lines.push(`--- ${sec.label} ---`);
      lines.push(sec.json);
      lines.push('');
    }

    // Registro completo (opcional)
    lines.push('--- Registro bruto (completo) ---');
    lines.push(JSON.stringify(row, null, 2));

    return lines.join('\n');
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-slide-up"
      onClick={onClose}
    >
      <div
        className="bg-card text-card-foreground border border-border rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Detalhes do registro</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {translateAction(getSubtitle())}
              {getIdentifier() ? ` — ${getIdentifier()}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(buildFullLogText())}
              className="h-8 flex items-center gap-2"
            >
              <IconCopy className="h-3.5 w-3.5" />
              Copiar log completo
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground rounded-lg"
            >
              <IconX className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6">
          {sections.map((sec, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {sec.label}
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(sec.json)}
                  className="h-8 flex items-center gap-2"
                >
                  <IconCopy className="h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
              <pre className="bg-muted border border-border/50 rounded-lg p-4 text-sm text-foreground overflow-x-auto whitespace-pre-wrap break-words leading-relaxed font-mono">
                {sec.json}
              </pre>
            </div>
          ))}

          {sections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <IconCode className="h-10 w-10 mb-3 opacity-50" />
              <p className="text-sm">Nenhum dado adicional disponível para este registro.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
