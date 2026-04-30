'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/services/api';
import { toast } from 'sonner';
import { HiLockClosed, HiRefresh } from 'react-icons/hi';
import { GalleryVerticalEnd } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    try {
      await login(password);
      toast.success('Acesso autorizado! Redirecionando...');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || 'Senha incorreta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6 animate-slide-up", className)} {...props}>
      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex flex-col items-center gap-2 font-medium">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-600/10 border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
                <GalleryVerticalEnd className="size-6 text-indigo-500" />
              </div>
              <span className="sr-only">Integrador App</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mt-2">Bem-vindo de volta</h1>
            <FieldDescription>
              Insira sua senha mestre para acessar o painel.
            </FieldDescription>
          </div>
          
          <Field>
            <FieldLabel htmlFor="password">Senha de Acesso</FieldLabel>
            <div className="relative">
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
              />
              <HiLockClosed className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 w-5 h-5" />
            </div>
          </Field>

          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <HiRefresh className="animate-spin" />
                Validando...
              </>
            ) : (
              'Entrar no Sistema'
            )}
          </Button>

          <div className="text-center text-xs text-gray-500 mt-4">
            Protegido por criptografia de ponta a ponta.
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}
