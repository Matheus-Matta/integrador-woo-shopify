'use client';

import { useState } from 'react';
import type { LogType, LogsFilters } from '@/types';
import { format } from 'date-fns';
import { IconSearch, IconFilter, IconX, IconCircleCheckFilled, IconCircleXFilled, IconAlertTriangleFilled } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/date-picker-with-range';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface LogFiltersProps {
  type: LogType;
  filters: LogsFilters;
  onChange: (newFilters: LogsFilters) => void;
}

const ACTION_OPTIONS: Record<LogType, string[]> = {
  order: ['create', 'update', 'mark_paid', 'create_fulfillment', 'mark_delivered', 'update_skipped_not_completed'],
  customer: ['create', 'update'],
  product: ['stock_update', 'price_update', 'title_update'],
  error: [],
};

const SEARCH_PLACEHOLDER: Record<LogType, string> = {
  order: 'Buscar por nº do pedido (#1101)...',
  customer: 'Buscar por e-mail...',
  product: 'Buscar por SKU...',
  error: 'Buscar por flow ou erro...',
};

export function LogFilters({ type, filters, onChange }: LogFiltersProps) {
  const [localSearch, setLocalSearch] = useState(filters.search ?? '');

  const hasActiveFilters = Boolean(
    filters.search || filters.status || filters.action || filters.from || filters.to
  );

  const handleSearch = () => {
    onChange({ ...filters, search: localSearch, page: 1 });
  };

  const handleClear = () => {
    setLocalSearch('');
    onChange({
      type,
      page: 1,
      limit: filters.limit,
    });
  };

  return (
    <Card className="mb-4">
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3">
          {/* Busca Textual */}
          <div className="flex-1 min-w-[200px] relative">
            <IconSearch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={SEARCH_PLACEHOLDER[type]}
              className="pl-9 bg-background"
            />
          </div>

          {/* Status */}
          {type !== 'error' && (
            <Select
              value={filters.status ?? ''}
              onValueChange={(val) => onChange({ ...filters, status: val === "all" ? "" : val, page: 1 })}
            >
              <SelectTrigger className="w-[160px] bg-background">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="success">
                  <div className="flex items-center gap-2">
                    <IconCircleCheckFilled className="h-4 w-4 text-green-500" />
                    <span>Sucesso</span>
                  </div>
                </SelectItem>
                <SelectItem value="error">
                  <div className="flex items-center gap-2">
                    <IconCircleXFilled className="h-4 w-4 text-red-500" />
                    <span>Erro</span>
                  </div>
                </SelectItem>
                <SelectItem value="skipped">
                  <div className="flex items-center gap-2">
                    <IconAlertTriangleFilled className="h-4 w-4 text-yellow-500" />
                    <span>Ignorado</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          )}

          {/* Ação */}
          {ACTION_OPTIONS[type].length > 0 && (
            <Select
              value={filters.action ?? ''}
              onValueChange={(val) => onChange({ ...filters, action: val === "all" ? "" : val, page: 1 })}
            >
              <SelectTrigger className="w-[180px] bg-background">
                <SelectValue placeholder="Todas as ações" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as ações</SelectItem>
                {ACTION_OPTIONS[type].map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Período</label>
            <DatePickerWithRange 
              date={{
                from: filters.from ? new Date(filters.from + "T00:00:00") : undefined,
                to: filters.to ? new Date(filters.to + "T00:00:00") : undefined
              }}
              setDate={(date) => {
                onChange({
                  ...filters,
                  from: date?.from ? format(date.from, 'yyyy-MM-dd') : undefined,
                  to: date?.to ? format(date.to, 'yyyy-MM-dd') : undefined,
                  page: 1
                })
              }}
            />
          </div>

          <div className="flex gap-2 ml-auto items-end">
            <Button onClick={handleSearch} className="gap-2">
              <IconFilter className="h-4 w-4" />
              Filtrar
            </Button>
            
            {hasActiveFilters && (
              <Button variant="outline" onClick={handleClear} className="gap-2">
                <IconX className="h-4 w-4" />
                Limpar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
