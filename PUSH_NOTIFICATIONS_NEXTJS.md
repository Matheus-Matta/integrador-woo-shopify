# Push Notifications — Integração Next.js

## Como funciona

```
App (React Native)
  → gera ExponentPushToken
  → envia para POST /api/device-token

Backend (Next.js)
  → salva token no banco vinculado ao usuário
  → quando quiser notificar: POST https://exp.host/--/api/v2/push/send
```

---

## 1. Salvar o token do dispositivo

Crie o arquivo `app/api/device-token/route.ts` (ou `pages/api/device-token.ts`):

### App Router (`app/api/device-token/route.ts`)

```ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, token, platform } = body;

  if (!userId || !token) {
    return NextResponse.json({ error: "userId e token são obrigatórios" }, { status: 400 });
  }

  // Salva no banco — exemplo com Prisma:
  // await prisma.deviceToken.upsert({
  //   where: { userId_platform: { userId, platform } },
  //   update: { token },
  //   create: { userId, token, platform },
  // });

  console.log(`[Push] Token salvo: userId=${userId} platform=${platform}`);
  return NextResponse.json({ ok: true });
}
```

### Pages Router (`pages/api/device-token.ts`)

```ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId, token, platform } = req.body;

  if (!userId || !token) {
    return res.status(400).json({ error: "userId e token são obrigatórios" });
  }

  // Salva no banco aqui

  return res.status(200).json({ ok: true });
}
```

---

## 2. Enviar notificações

Crie o arquivo `lib/pushNotifications.ts`:

```ts
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface PushMessage {
  to: string | string[];   // ExponentPushToken[...]
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

export async function sendPushNotification(message: PushMessage) {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(message),
  });

  const result = await response.json();
  return result;
}

export async function sendPushToMany(tokens: string[], title: string, body: string, data?: Record<string, unknown>) {
  // Expo aceita até 100 tokens por requisição
  const chunks = chunkArray(tokens, 100);

  const results = await Promise.all(
    chunks.map((chunk) =>
      sendPushNotification({ to: chunk, title, body, data, sound: "default" })
    )
  );

  return results.flat();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}
```

---

## 3. Exemplos de uso no backend

### Notificar um usuário específico

```ts
import { sendPushNotification } from "@/lib/pushNotifications";

// Busca o token do usuário no banco
const deviceToken = await prisma.deviceToken.findFirst({
  where: { userId: 123 },
});

if (deviceToken) {
  await sendPushNotification({
    to: deviceToken.token,
    title: "Maxxx Móveis",
    body: "Seu pedido foi atualizado.",
    data: {
      url: "https://maxxxmoveis.com.br/pedidos",
    },
  });
}
```

### Notificar todos os usuários (broadcast)

```ts
import { sendPushToMany } from "@/lib/pushNotifications";

const tokens = await prisma.deviceToken.findMany({
  select: { token: true },
});

await sendPushToMany(
  tokens.map((t) => t.token),
  "Maxxx Móveis",
  "Tem novidade esperando por você!",
  { url: "https://maxxxmoveis.com.br" }
);
```

### Disparo via rota de API

```ts
// app/api/notify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendPushNotification } from "@/lib/pushNotifications";

export async function POST(req: NextRequest) {
  const { userId, title, body, url } = await req.json();

  // Busca token do usuário no banco
  // const device = await prisma.deviceToken.findFirst({ where: { userId } });
  // if (!device) return NextResponse.json({ error: "Token não encontrado" }, { status: 404 });

  await sendPushNotification({
    to: "ExponentPushToken[...]", // device.token
    title,
    body,
    data: { url },
    sound: "default",
  });

  return NextResponse.json({ ok: true });
}
```

---

## 4. Schema Prisma (exemplo)

```prisma
model DeviceToken {
  id        Int      @id @default(autoincrement())
  userId    Int
  token     String
  platform  String   @default("android") // "android" | "ios"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, platform])
}
```

---

## 5. Variável de ambiente

O app mobile envia o token para `EXPO_PUBLIC_API_URL/api/device-token`.
Certifique-se que no `eas.json` (profile production) está:

```json
"EXPO_PUBLIC_API_URL": "https://maxxxmoveis.com.br"
```

---

## 6. Testar localmente

Substitua `ExponentPushToken[...]` por um token real (impresso no console do app em dev) e rode:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[SEU_TOKEN_AQUI]",
    "title": "Teste",
    "body": "Notificação funcionando!",
    "sound": "default"
  }'
```

---

## Checklist

- [ ] Novo build de dev com `google-services.json` incluído
- [ ] Rota `POST /api/device-token` criada no Next.js
- [ ] Token salvo no banco vinculado ao usuário após login
- [ ] Função `sendPushNotification` implementada em `lib/pushNotifications.ts`
- [ ] `EXPO_PUBLIC_API_URL` apontando para o backend em produção
- [ ] iOS APNs configurado (quando tiver Apple Developer account)
