"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowLeft, IconDeviceFloppy, IconTrash } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Resource = "products" | "orders" | "customers";

const titles = {
  products: { single: "produto", list: "products" },
  orders: { single: "pedido", list: "orders" },
  customers: { single: "cliente", list: "customers" },
} as const;

function defaultPayload(resource: Resource) {
  if (resource === "products") {
    return {
      name: "Novo produto",
      sku: "",
      type: "simple",
      status: "publish",
      price: "0.00",
      regular_price: "0.00",
      stock_status: "instock",
      meta_data: [],
    };
  }
  if (resource === "customers") {
    return {
      email: "",
      first_name: "",
      last_name: "",
      role: "customer",
      billing: { email: "", phone: "" },
      shipping: {},
      meta_data: [],
    };
  }
  return {
    number: "",
    status: "processing",
    currency: "BRL",
    total: "0.00",
    billing: { email: "" },
    shipping: {},
    line_items: [],
    meta_data: [],
  };
}

export function WooResourceEditor({ resource, id }: { resource: Resource; id?: string }) {
  const router = useRouter();
  const isNew = !id;
  const title = titles[resource];
  const [json, setJson] = useState(() => JSON.stringify(defaultPayload(resource), null, 2));
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const endpoint = useMemo(() => `/api/dashboard/woo/${resource}${id ? `/${id}` : ""}`, [resource, id]);

  useEffect(() => {
    if (isNew) return;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(endpoint);
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Registro nao encontrado");
        setJson(JSON.stringify(body, null, 2));
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [endpoint, isNew]);

  async function save() {
    setSaving(true);
    setError("");
    setSavedMessage("");
    try {
      const payload = JSON.parse(json);
      const response = await fetch(endpoint, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao salvar");
      setJson(JSON.stringify(body, null, 2));
      setSavedMessage("Salvo com sucesso.");
      if (isNew && body.id) router.replace(`/dashboard/${resource}/${body.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (isNew || !id) return;
    if (!window.confirm(`Excluir este ${title.single}?`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao excluir");
      router.push(`/dashboard/${resource}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/dashboard/${resource}`)}>
            <IconArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{isNew ? `Criar ${title.single}` : `Editar ${title.single}`}</h1>
            <p className="text-sm text-muted-foreground">Edite o JSON no formato WooCommerce. Campos extras serão preservados.</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button variant="destructive" onClick={remove} disabled={saving}>
              <IconTrash className="mr-2 h-4 w-4" />
              Excluir
            </Button>
          )}
          <Button onClick={save} disabled={saving || loading}>
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>JSON WooCommerce</CardTitle>
          <CardDescription>Esse conteúdo será salvo em `raw` e retornado pela API `/wp-json/wc/v3/{title.list}`.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
          {savedMessage && <div className="rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm text-green-600">{savedMessage}</div>}
          <textarea
            value={json}
            onChange={(event) => setJson(event.target.value)}
            disabled={loading}
            spellCheck={false}
            className="min-h-[560px] w-full resize-y rounded-md border bg-background p-4 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </CardContent>
      </Card>
    </div>
  );
}
