"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  IconBrandShopee,
  IconWorldWww,
  IconDeviceFloppy,
  IconBrandWordpress,
  IconBox,
  IconFlask,
  IconCheck,
  IconX,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { toast } from "sonner"

function SettingField({
  label,
  description,
  id,
  name,
  type = "text",
  placeholder,
  value,
  onChange,
}: {
  label: string
  description?: string
  id: string
  name: string
  type?: string
  placeholder?: string
  value: string
  onChange: (val: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <Input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-xl"
      />
    </div>
  )
}

export default function SettingsIntegrationPage() {
  const [config, setConfig] = useState<any>(null)
  const [originalConfig, setOriginalConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<null | { success: boolean; status: number; payloadEnviado: unknown; respostaWebhook: unknown; error?: string }>(null)

  useEffect(() => {
    fetch("/api/dashboard/config")
      .then((res) => res.json())
      .then((data) => {
        setOriginalConfig(JSON.parse(JSON.stringify(data)))
        
        // Mask secrets for display
        const displayData = JSON.parse(JSON.stringify(data))
        if (displayData.shopify?.accessToken) displayData.shopify.accessToken = "********"
        if (displayData.shopify?.webhookSecret) displayData.shopify.webhookSecret = "********"
        if (displayData.woo?.key) displayData.woo.key = "********"
        if (displayData.woo?.secret) displayData.woo.secret = "********"
        if (displayData.woo?.webhookSecret) displayData.woo.webhookSecret = "********"
        if (displayData.lexos?.webhookToken) displayData.lexos.webhookToken = "********"
        if (displayData.lexos?.apiToken) displayData.lexos.apiToken = "********"
        if (displayData.lexos?.integrationKey) displayData.lexos.integrationKey = "********"
        
        setConfig(displayData)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        toast.error("Erro ao carregar configurações")
        setLoading(false)
      })
  }, [])

  const updateConfig = (section: string, field: string, value: string) => {
    setConfig((prev: any) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }))
  }

  async function handleTestLexosWebhook(event: 'pedido.criado' | 'pedido.atualizado') {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/dashboard/test/lexos-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event }),
      })
      const data = await res.json()
      setTestResult(data)
      if (data.success) {
        toast.success(`Webhook de teste (${event}) enviado com sucesso!`)
      } else {
        toast.error(`Falha no webhook de teste: HTTP ${data.status}`)
      }
    } catch (err) {
      toast.error('Erro ao enviar webhook de teste')
      setTestResult({ success: false, status: 0, payloadEnviado: null, respostaWebhook: null, error: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const updateDomain = (value: string) => {
    setConfig((prev: any) => ({
      ...prev,
      domain: value
    }))
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)

    try {
      // Prepare payload, restoring original values if still masked
      const payload = JSON.parse(JSON.stringify(config))
      
      if (payload.shopify.accessToken === "********") {
        payload.shopify.accessToken = originalConfig.shopify.accessToken
      }
      if (payload.shopify.webhookSecret === "********") {
        payload.shopify.webhookSecret = originalConfig.shopify.webhookSecret
      }
      if (payload.woo.key === "********") {
        payload.woo.key = originalConfig.woo.key
      }
      if (payload.woo.secret === "********") {
        payload.woo.secret = originalConfig.woo.secret
      }
      if (payload.woo.webhookSecret === "********") {
        payload.woo.webhookSecret = originalConfig.woo.webhookSecret
      }
      if (payload.lexos.webhookToken === "********") {
        payload.lexos.webhookToken = originalConfig.lexos.webhookToken
      }
      if (payload.lexos.apiToken === "********") {
        payload.lexos.apiToken = originalConfig.lexos.apiToken
      }
      if (payload.lexos.integrationKey === "********") {
        payload.lexos.integrationKey = originalConfig.lexos.integrationKey
      }

      const res = await fetch("/api/dashboard/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await res.json()

      if (result.success) {
        toast.success("Configurações atualizadas com sucesso!")
        setOriginalConfig(JSON.parse(JSON.stringify(payload)))
      } else {
        toast.error(result.message || "Erro ao salvar")
      }
    } catch (error) {
      toast.error("Ocorreu um erro inesperado ao salvar.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground p-6">Carregando configurações...</div>
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      {/* Shopify */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <IconBrandShopee className="h-5 w-5 text-[#95bf47]" />
            Shopify
          </CardTitle>
          <CardDescription>
            Configurações da loja Shopify conectada ao integrador.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5">
          <SettingField
            label="URL da API GraphQL"
            description="Ex: https://loja.myshopify.com/admin/api/2025-01/graphql.json"
            id="shopify-url"
            name="shopify-url"
            placeholder="https://loja.myshopify.com/admin/api/2025-01/graphql.json"
            value={config.shopify.url || ""}
            onChange={(val) => updateConfig("shopify", "url", val)}
          />
          <SettingField
            label="Access Token"
            description="Token de acesso do app privado (shpat_...)"
            id="shopify-token"
            name="shopify-token"
            type="password"
            placeholder="shpat_..."
            value={config.shopify.accessToken || ""}
            onChange={(val) => updateConfig("shopify", "accessToken", val)}
          />
          <SettingField
            label="Webhook Secret"
            description="Secret para validação HMAC dos webhooks Shopify"
            id="shopify-secret"
            name="shopify-secret"
            type="password"
            placeholder="••••••••"
            value={config.shopify.webhookSecret || ""}
            onChange={(val) => updateConfig("shopify", "webhookSecret", val)}
          />
        </CardContent>
      </Card>

      {/* WooCommerce */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <IconBrandWordpress className="h-5 w-5 text-[#96588a]" />
            WooCommerce
          </CardTitle>
          <CardDescription>
            Configurações da loja WooCommerce conectada ao integrador.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5">
          <SettingField
            label="URL do Site"
            description="URL base da sua loja (ex: https://meusite.com.br)"
            id="woo-url"
            name="woo-url"
            placeholder="https://meusite.com.br"
            value={config.woo.url || ""}
            onChange={(val) => updateConfig("woo", "url", val)}
          />
          <SettingField
            label="Consumer Key"
            description="Chave de consumidor da API REST do WooCommerce (ck_...)"
            id="woo-key"
            name="woo-key"
            type="password"
            placeholder="ck_..."
            value={config.woo.key || ""}
            onChange={(val) => updateConfig("woo", "key", val)}
          />
          <SettingField
            label="Consumer Secret"
            description="Segredo do consumidor da API REST do WooCommerce (cs_...)"
            id="woo-secret"
            name="woo-secret"
            type="password"
            placeholder="cs_..."
            value={config.woo.secret || ""}
            onChange={(val) => updateConfig("woo", "secret", val)}
          />
          <SettingField
            label="Webhook Secret"
            description="Secret para validação HMAC dos webhooks WooCommerce"
            id="woo-webhook-secret"
            name="woo-webhook-secret"
            type="password"
            placeholder="••••••••"
            value={config.woo.webhookSecret || ""}
            onChange={(val) => updateConfig("woo", "webhookSecret", val)}
          />
        </CardContent>
      </Card>

      {/* Lexos */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <IconBox className="h-5 w-5 text-[#f0801a]" />
            Lexos Hub
          </CardTitle>
          <CardDescription>
            Configurações da integração com Lexos Hub (ERP).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5">
          <SettingField
            label="URL da API"
            description="URL base da API Lexos (padrão: https://api.lexos.com.br)"
            id="lexos-url"
            name="lexos-url"
            placeholder="https://api.lexos.com.br"
            value={config.lexos?.url || ""}
            onChange={(val) => updateConfig("lexos", "url", val)}
          />
          <SettingField
            label="API Token"
            description="Token JWT de autenticação na API da Lexos"
            id="lexos-api-token"
            name="lexos-api-token"
            type="password"
            placeholder="••••••••"
            value={config.lexos?.apiToken || ""}
            onChange={(val) => updateConfig("lexos", "apiToken", val)}
          />
          <SettingField
            label="Integration Key"
            description="Chave da integração Lexos (Header: Chave)"
            id="lexos-integration-key"
            name="lexos-integration-key"
            type="password"
            placeholder="••••••••"
            value={config.lexos?.integrationKey || ""}
            onChange={(val) => updateConfig("lexos", "integrationKey", val)}
          />
          <SettingField
            label="Webhook Token (Opcional)"
            description="Token para validação de segurança nos webhooks recebidos da Lexos"
            id="lexos-webhook-token"
            name="lexos-webhook-token"
            type="password"
            placeholder="••••••••"
            value={config.lexos?.webhookToken || ""}
            onChange={(val) => updateConfig("lexos", "webhookToken", val)}
          />
        </CardContent>
      </Card>

      {/* Domínio */}
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2">
            <IconWorldWww className="h-5 w-5 text-primary" />
            Domínio
          </CardTitle>
          <CardDescription>
            URL pública onde o integrador está exposto. Usado para registrar os webhooks automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5">
          <SettingField
            label="Domínio público"
            description="Ex: https://integrador.meudominio.com"
            id="domain"
            name="domain"
            placeholder="https://integrador.meudominio.com"
            value={config.domain || ""}
            onChange={(val) => updateDomain(val)}
          />
        </CardContent>
      </Card>

      {/* Teste de Webhook Lexos */}
      <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
        <CardHeader className="border-b pb-4">
          <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <IconFlask className="h-5 w-5" />
            Teste de Webhook Lexos
          </CardTitle>
          <CardDescription>
            Simula um pedido de teste enviado pela Lexos para o webhook do integrador. Útil para validar a configuração sem depender da Lexos real.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-amber-500/50 hover:bg-amber-500/10"
              onClick={() => handleTestLexosWebhook('pedido.criado')}
              disabled={testing}
            >
              <IconFlask className="h-4 w-4" />
              {testing ? 'Enviando...' : 'Testar pedido.criado'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2 border-amber-500/50 hover:bg-amber-500/10"
              onClick={() => handleTestLexosWebhook('pedido.atualizado')}
              disabled={testing}
            >
              <IconFlask className="h-4 w-4" />
              {testing ? 'Enviando...' : 'Testar pedido.atualizado'}
            </Button>
          </div>

          {testResult && (
            <div className={`rounded-md border p-4 flex flex-col gap-3 text-sm ${
              testResult.success
                ? 'bg-green-500/5 border-green-500/30'
                : 'bg-destructive/5 border-destructive/30'
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {testResult.success
                  ? <><IconCheck className="h-4 w-4 text-green-500" /> <span className="text-green-600 dark:text-green-400">Webhook recebido com sucesso (HTTP {testResult.status})</span></>
                  : <><IconX className="h-4 w-4 text-destructive" /> <span className="text-destructive">Falha (HTTP {testResult.status || '—'})</span></>
                }
              </div>
              {testResult.error && (
                <div className="flex items-start gap-2 text-destructive">
                  <IconAlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>{testResult.error}</p>
                </div>
              )}
              {Boolean(testResult.respostaWebhook) && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resposta do Webhook</span>
                  <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-36">{JSON.stringify(testResult.respostaWebhook as object, null, 2)}</pre>
                </div>
              )}
              {Boolean(testResult.payloadEnviado) && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver payload enviado</summary>
                  <pre className="mt-2 bg-muted rounded p-2 overflow-auto max-h-48">{JSON.stringify(testResult.payloadEnviado as object, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end items-center mb-8">
        <p className="text-xs text-muted-foreground flex-1">
          As configurações são atualizadas instantaneamente no sistema, sem necessidade de reinício.
        </p>
        <Button type="submit" className="gap-2" disabled={saving}>
          <IconDeviceFloppy className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  )
}

