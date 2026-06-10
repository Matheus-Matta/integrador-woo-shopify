import { NextResponse } from 'next/server';

export type WooErrorCode =
  | 'woocommerce_rest_cannot_view'
  | 'woocommerce_rest_cannot_create'
  | 'woocommerce_rest_cannot_edit'
  | 'woocommerce_rest_cannot_delete'
  | 'woocommerce_rest_product_invalid_id'
  | 'woocommerce_rest_customer_invalid_id'
  | 'woocommerce_rest_shop_order_invalid_id'
  | 'woocommerce_rest_term_invalid_id'
  | 'woocommerce_rest_invalid_json'
  | 'woocommerce_rest_invalid_param'
  | 'woocommerce_rest_authentication_error';

export function wooError(code: WooErrorCode, message: string, status: number) {
  return NextResponse.json(
    {
      code,
      message,
      data: { status },
    },
    { status }
  );
}

export function invalidId(resource: 'product' | 'term' = 'product') {
  return wooError(
    resource === 'product' ? 'woocommerce_rest_product_invalid_id' : 'woocommerce_rest_term_invalid_id',
    'Invalid ID.',
    404
  );
}

export function invalidCustomerId() {
  return wooError('woocommerce_rest_customer_invalid_id', 'Invalid resource ID.', 404);
}

export function invalidOrderId() {
  return wooError('woocommerce_rest_shop_order_invalid_id', 'Invalid ID.', 404);
}
