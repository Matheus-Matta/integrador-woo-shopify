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
  webhook:            { type: Schema.Types.Mixed },          // dados brutos recebidos via webhook
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
  origin:            { type: String, index: true }, // shopify | lexos | woo | scheduler
  action:            { type: String, required: true },       // create | update | mark_paid | fulfillment | delivered
  webhook:           { type: Schema.Types.Mixed },           // dados brutos recebidos via webhook
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
  // Enriquecimento para facilitar busca por entidade
  entity_type: { type: String, enum: ['order', 'product', 'customer'], index: true },
  entity_id:   { type: String, index: true },
  shopify_order_id: { type: String, index: true },
  woo_order_id:     { type: Number, index: true },
  email:            { type: String, index: true },
  sku:              { type: String, index: true },
  timestamp: { type: Date, default: Date.now, expires: '30d' },
});

const notificationTemplateSchema = new Schema({
  name:      { type: String, required: true },
  title:     { type: String, required: true },
  body:      { type: String, required: true },
  url:       { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const notificationScheduleSchema = new Schema({
  templateId:   { type: Schema.Types.ObjectId, required: true, index: true },
  templateName: { type: String, default: '' },
  mode:         { type: String, enum: ['broadcast', 'individual'], required: true },
  userId:       { type: String, default: '' },
  frequency:    { type: String, required: true },
  active:       { type: Boolean, default: true },
  repeatKey:    { type: String, default: '' },
  lgpdConsent:  { type: Boolean, default: false },
  createdAt:    { type: Date, default: Date.now },
});

const deviceTokenSchema = new Schema({
  token:     { type: String, required: true, unique: true }, // chave única — app envia antes do login
  platform:  { type: String, enum: ['android', 'ios', 'unknown'], default: 'unknown' },
  userId:    { type: String, default: null, index: true, sparse: true }, // null até o usuário fazer login
  label:     { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const pushNotificationLogSchema = new Schema({
  to:      { type: Schema.Types.Mixed, required: true },
  title:   { type: String, required: true },
  body:    { type: String, required: true },
  data:    { type: Schema.Types.Mixed },
  result:  { type: Schema.Types.Mixed },
  sentBy:  { type: String, default: 'dashboard' },
  sentAt:  { type: Date, default: Date.now, expires: '90d' },
});

// ─── Models ────────────────────────────────────────────────────────────────

export type LogProduct  = InferSchemaType<typeof logProductSchema>  & Document;
export type LogCustomer = InferSchemaType<typeof logCustomerSchema> & Document;
export type LogOrder    = InferSchemaType<typeof logOrderSchema>    & Document;
export type LogError    = InferSchemaType<typeof logErrorSchema>    & Document;
export type DeviceToken = InferSchemaType<typeof deviceTokenSchema> & Document;
export type PushNotificationLog = InferSchemaType<typeof pushNotificationLogSchema> & Document;
export type NotificationTemplate = InferSchemaType<typeof notificationTemplateSchema> & Document;
export type NotificationSchedule = InferSchemaType<typeof notificationScheduleSchema> & Document;

export const LogProductModel  = mongoose.models.logs_products || model<LogProduct>('logs_products',  logProductSchema);
export const LogCustomerModel = mongoose.models.logs_customers || model<LogCustomer>('logs_customers', logCustomerSchema);
export const LogOrderModel    = mongoose.models.logs_orders || model<LogOrder>('logs_orders',    logOrderSchema);
export const LogErrorModel    = mongoose.models.logs_errors || model<LogError>('logs_errors',    logErrorSchema);
export const DeviceTokenModel = mongoose.models.device_tokens || model<DeviceToken>('device_tokens', deviceTokenSchema);
export const PushNotificationLogModel = mongoose.models.push_notification_logs || model<PushNotificationLog>('push_notification_logs', pushNotificationLogSchema);
export const NotificationTemplateModel = mongoose.models.notification_templates || model<NotificationTemplate>('notification_templates', notificationTemplateSchema);
export const NotificationScheduleModel = mongoose.models.notification_schedules || model<NotificationSchedule>('notification_schedules', notificationScheduleSchema);

// ─── Connection ────────────────────────────────────────────────────────────

// Usar cache global para evitar múltiplas conexões no dev (HMR)
const globalWithMongoose = global as typeof globalThis & {
  mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
};

let cached = globalWithMongoose.mongoose;

if (!cached) {
  cached = globalWithMongoose.mongoose = { conn: null, promise: null };
}

export async function connectMongo(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = { bufferCommands: false };
    cached.promise = mongoose.connect(config.mongodb.url, opts).then((mongoose) => {
      console.log('[MongoDB] ✅ Conexão estabelecida com sucesso.');
      return mongoose;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
