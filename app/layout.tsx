import type { Metadata } from 'next';
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { ReactQueryProvider } from '@/providers/ReactQueryProvider';
import { ToastProvider } from '@/providers/ToastProvider';
import { cn } from "@/lib/utils";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plus-jakarta',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Integrador Shopify ↔ WooCommerce',
  description: 'Dashboard de monitoramento da integração Shopify-WooCommerce',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={cn("dark", plusJakarta.variable, jetBrainsMono.variable)}>
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
      </head>
      <body className={cn(plusJakarta.className, "bg-surface-900 text-gray-100 min-h-screen antialiased")}>
        <ReactQueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </ReactQueryProvider>
      </body>
    </html>
  );
}
