"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconEdit, IconPlus, IconRefresh, IconSearch } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Resource = "products" | "orders" | "customers";

const config = {
  products: {
    title: "Produtos",
    description: "Produtos salvos no MongoDB no formato WooCommerce.",
    createLabel: "Criar produto",
    columns: ["ID", "Nome", "SKU", "Status", "Tipo", "Atualizado"],
  },
  orders: {
    title: "Pedidos",
    description: "Pedidos Woo compatíveis, incluindo vínculo com customers.",
    createLabel: "Criar pedido",
    columns: ["ID", "Número", "Cliente", "Status", "Total", "Atualizado"],
  },
  customers: {
    title: "Clientes",
    description: "Clientes Woo compatíveis, deduplicados por e-mail.",
    createLabel: "Criar cliente",
    columns: ["ID", "Nome", "E-mail", "Telefone", "Papel", "Atualizado"],
  },
} as const;

function fmtDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function rowCells(resource: Resource, item: any) {
  if (resource === "products") {
    return [item.id, item.name || "-", item.sku || "-", item.status || "-", item.type || "-", fmtDate(item.date_modified)];
  }
  if (resource === "orders") {
    return [item.id, item.number || "-", item.billing?.email || item.customer_id || "-", item.status || "-", item.total || "0.00", fmtDate(item.date_modified)];
  }
  return [
    item.id,
    `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.username || "-",
    item.email || "-",
    item.billing?.phone || "-",
    item.role || "customer",
    fmtDate(item.date_modified),
  ];
}

export function WooResourceList({ resource }: { resource: Resource }) {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const meta = config[resource];

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: "20" });
    if (search.trim()) params.set("search", search.trim());
    return params.toString();
  }, [page, search]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/dashboard/woo/${resource}?${query}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao carregar dados");
      setItems(body.data || []);
      setTotalPages(body.pagination?.totalPages || 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [query, resource]);

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">{meta.description}</p>
        </div>
        <Button nativeButton={false} render={<Link href={`/dashboard/${resource}/new`} />} className="gap-2">
          <IconPlus className="h-4 w-4" />
          {meta.createLabel}
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3 border-b">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Lista</CardTitle>
              <CardDescription>Edite, crie ou remova registros usados pela API Woo compatível.</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => {
                    setPage(1);
                    setSearch(event.target.value);
                  }}
                  placeholder="Buscar"
                  className="w-64 pl-8"
                />
              </div>
              <Button type="button" variant="outline" size="icon" onClick={load}>
                <IconRefresh className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-destructive">{error}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {meta.columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={meta.columns.length + 1} className="py-10 text-center text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={meta.columns.length + 1} className="py-10 text-center text-muted-foreground">
                      Nenhum registro encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      {rowCells(resource, item).map((cell, index) => (
                        <TableCell key={index}>
                          {index === 3 && resource !== "customers" ? <Badge variant="outline">{String(cell)}</Badge> : String(cell)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right">
                        <Button nativeButton={false} variant="ghost" size="sm" render={<Link href={`/dashboard/${resource}/${item.id}`} />} className="gap-2">
                          <IconEdit className="h-4 w-4" />
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          Página {page} de {totalPages}
        </span>
        <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
          Próxima
        </Button>
      </div>
    </div>
  );
}
