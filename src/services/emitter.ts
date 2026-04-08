import { EventEmitter } from 'events';

export interface LogEvent {
  type: 'product' | 'customer' | 'order' | 'error';
  data: Record<string, unknown>;
  ts: string;
}

export interface QueueEvent {
  queue: 'orders' | 'products';
  jobName: string;
  status: 'added' | 'active' | 'completed' | 'failed';
  jobId?: string | number | undefined;
  error?: string;
  ts: string;
}

class LogEmitter extends EventEmitter {}

export const logEmitter = new LogEmitter();
