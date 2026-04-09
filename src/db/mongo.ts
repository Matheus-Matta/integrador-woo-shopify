import mongoose, { Schema, model, Document, InferSchemaType } from 'mongoose';
import { config } from '../config';

// ─── Schemas ───────────────────────────────────────────────────────────────

const logProductSchema = new Schema({
  sku:               { type: String, required: true, index: true },
  action:            { type: String, required: true },       // title_update | stock_update | price_update
  before:            { type: Schema.Types.Mixed },
  after:             { type: Schema.Types.Mixed },
  shopify_response:  { type: Schema.Types.Mixed },
  status:            { type: String, enum: ['success', 'error', 'skipped'], default: 'success' },
  timestamp:         { type: Date, default: Date.now, expires: '30d' },
});

const logCustomerSchema = new Schema({
  email:              { type: String, index: true },
  shopify_customer_id:{ type: String, index: true },
  woo_customer_id:    { type: Number, index: true },
  woo_instance:       { type: String },                      // starchats | starseguro
  action:             { type: String, required: true },      // create | update
  payload:            { type: Schema.Types.Mixed },
  response:           { type: Schema.Types.Mixed },
  status:             { type: String, enum: ['success', 'error', 'skipped'], default: 'success' },
  timestamp:          { type: Date, default: Date.now, expires: '30d' },
});

const logOrderSchema = new Schema({
  shopify_order_id:  { type: String, index: true },
  shopify_order_name:{ type: String },
  woo_order_id:      { type: Number, index: true },
  woo_instance:      { type: String },
  action:            { type: String, required: true },       // create | update | mark_paid | fulfillment | delivered
  payload:           { type: Schema.Types.Mixed },
  response:          { type: Schema.Types.Mixed },
  status:            { type: String, enum: ['success', 'error', 'skipped'], default: 'success' },
  timestamp:         { type: Date, default: Date.now, expires: '30d' },
});

const logErrorSchema = new Schema({
  flow:      { type: String, required: true, index: true }, // woo-product | shop-order-create | ...
  error_message: { type: String },
  stack:     { type: String },
  payload:   { type: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, expires: '30d' },
});

// ─── Models ────────────────────────────────────────────────────────────────

export type LogProduct  = InferSchemaType<typeof logProductSchema>  & Document;
export type LogCustomer = InferSchemaType<typeof logCustomerSchema> & Document;
export type LogOrder    = InferSchemaType<typeof logOrderSchema>    & Document;
export type LogError    = InferSchemaType<typeof logErrorSchema>    & Document;

export const LogProductModel  = model<LogProduct>('logs_products',  logProductSchema);
export const LogCustomerModel = model<LogCustomer>('logs_customers', logCustomerSchema);
export const LogOrderModel    = model<LogOrder>('logs_orders',    logOrderSchema);
export const LogErrorModel    = model<LogError>('logs_errors',    logErrorSchema);

// ─── Connection ────────────────────────────────────────────────────────────

export async function connectMongo(): Promise<void> {
  await mongoose.connect(config.mongodb.url);
  console.log('[MongoDB] Conexão estabelecida:', config.mongodb.url);
}
