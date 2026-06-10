import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { NextRequest } from 'next/server';
import { connectWooMongo } from './mongodb';
import { ApiKeyModel, type ApiPermission } from '@/models/ApiKey';
import { wooError } from './woo-errors';

export type RequiredPermission = 'read' | 'write';

interface WooJwtPayload extends jwt.JwtPayload {
  scope?: string | string[];
  scp?: string | string[];
  permissions?: string | string[];
}

function safeEqual(input: string, expected: string) {
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function permissionAllows(actual: ApiPermission, required: RequiredPermission) {
  return actual === 'read_write' || actual === required;
}

function getBasicCredentials(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('basic ')) return null;

  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      consumerKey: decoded.slice(0, separator),
      consumerSecret: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

async function validateConsumerKey(consumerKey: string, consumerSecret: string, permission: RequiredPermission) {
  const defaultKey = process.env.DEFAULT_CONSUMER_KEY;
  const defaultSecret = process.env.DEFAULT_CONSUMER_SECRET;

  if (defaultKey && defaultSecret && safeEqual(consumerKey, defaultKey) && safeEqual(consumerSecret, defaultSecret)) {
    return true;
  }

  await connectWooMongo();
  const apiKey = await ApiKeyModel.findOne({ consumer_key: consumerKey, active: true }).lean();
  if (!apiKey) return false;

  return safeEqual(consumerSecret, String(apiKey.consumer_secret)) && permissionAllows(apiKey.permissions, permission);
}

function normalizeScopes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeScopes(item));
  }
  if (typeof value !== 'string') return [];
  return value
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}

function bearerAllows(decoded: string | jwt.JwtPayload, permission: RequiredPermission) {
  if (!decoded || typeof decoded === 'string') return false;

  const payload = decoded as WooJwtPayload;
  if (payload.sub !== 'woo-api') return false;

  const scopes = new Set([
    ...normalizeScopes(payload.scope),
    ...normalizeScopes(payload.scp),
    ...normalizeScopes(payload.permissions),
  ]);

  return scopes.has('read_write') || scopes.has(permission);
}

async function validateBearer(req: NextRequest, permission: RequiredPermission) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return false;

  const secret = process.env.JWT_SECRET;
  if (!secret) return false;

  try {
    const decoded = jwt.verify(auth.slice(7), secret);
    return bearerAllows(decoded, permission);
  } catch {
    return false;
  }
}

export async function requireWooAuth(req: NextRequest, permission: RequiredPermission) {
  if (await validateBearer(req, permission)) return null;

  const queryKey = req.nextUrl.searchParams.get('consumer_key');
  const querySecret = req.nextUrl.searchParams.get('consumer_secret');
  if (queryKey && querySecret && (await validateConsumerKey(queryKey, querySecret, permission))) {
    return null;
  }

  const basic = getBasicCredentials(req);
  if (basic && (await validateConsumerKey(basic.consumerKey, basic.consumerSecret, permission))) {
    return null;
  }

  const message = permission === 'read' ? 'Sorry, you cannot list resources.' : 'Sorry, you are not allowed to edit this resource.';
  return wooError('woocommerce_rest_cannot_view', message, 401);
}
