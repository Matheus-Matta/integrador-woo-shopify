import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const token = request.cookies.get('dash_token');
  const { pathname } = request.nextUrl;

  // Rota de login é pública
  if (pathname === '/login') {
    // Se já autenticado, redireciona para dashboard
    if (token) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // Protege tudo em /dashboard
  if (pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // Protege APIs operacionais do dashboard; a validacao JWT completa acontece nas rotas.
  if (pathname.startsWith('/api/dashboard')) {
    if (!token) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/dashboard/:path*', '/login'],
};
