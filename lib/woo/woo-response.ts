import { NextResponse } from 'next/server';

export function wooJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, init);
}

export function rawFromDocument(doc: { raw?: Record<string, unknown>; woo_id?: number } | null) {
  if (!doc) return null;
  const { _variation_data, ...raw } = doc.raw || {};
  return {
    ...raw,
    id: doc.woo_id,
  };
}

export function listHeaders(total: number, perPage: number) {
  return {
    'X-WP-Total': String(total),
    'X-WP-TotalPages': String(Math.max(1, Math.ceil(total / perPage))),
  };
}
