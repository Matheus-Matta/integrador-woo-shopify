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

