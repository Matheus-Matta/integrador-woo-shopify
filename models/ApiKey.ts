import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export type ApiPermission = 'read' | 'write' | 'read_write';

export interface ApiKeyDocument extends Document {
  consumer_key: string;
  consumer_secret: string;
  permissions: ApiPermission;
  description?: string;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

const apiKeySchema = new Schema<ApiKeyDocument>(
  {
    consumer_key: { type: String, required: true, unique: true, index: true },
    consumer_secret: { type: String, required: true },
    permissions: { type: String, enum: ['read', 'write', 'read_write'], default: 'read_write' },
    description: { type: String },
    active: { type: Boolean, default: true, index: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  { collection: 'api_keys' }
);

export const ApiKeyModel =
  (mongoose.models.WooApiKey as Model<ApiKeyDocument> | undefined) ||
  model<ApiKeyDocument>('WooApiKey', apiKeySchema);
