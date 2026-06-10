import mongoose, { Schema, model, type Document, type Model } from 'mongoose';

export interface AttributeTermDocument extends Document {
  woo_id: number;
  attribute_id: number;
  slug?: string;
  name?: string;
  raw: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

const attributeTermSchema = new Schema<AttributeTermDocument>(
  {
    woo_id: { type: Number, required: true, unique: true, index: true },
    attribute_id: { type: Number, required: true, index: true },
    slug: { type: String, index: true, sparse: true },
    name: { type: String },
    raw: { type: Schema.Types.Mixed, required: true, default: {} },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now, index: true },
  },
  { collection: 'attribute_terms' }
);

attributeTermSchema.index({ attribute_id: 1, slug: 1 }, { sparse: true });

export const AttributeTermModel =
  (mongoose.models.WooAttributeTerm as Model<AttributeTermDocument> | undefined) ||
  model<AttributeTermDocument>('WooAttributeTerm', attributeTermSchema);
