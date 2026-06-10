import type { NextRequest } from 'next/server';

function toPositiveInt(value: string | null, fallback: number, max?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  const clean = Math.floor(parsed);
  return max ? Math.min(clean, max) : clean;
}

export function getPagination(req: NextRequest) {
  const page = toPositiveInt(req.nextUrl.searchParams.get('page'), 1);
  const perPage = toPositiveInt(req.nextUrl.searchParams.get('per_page'), 10, 100);
  const offsetParam = req.nextUrl.searchParams.get('offset');
  const offset = offsetParam ? Math.max(0, Number(offsetParam) || 0) : (page - 1) * perPage;

  return { page, perPage, offset };
}
