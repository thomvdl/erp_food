export interface SelfOrderTax {
  id: number;
  slug: string;
  value: number | string;
}

export interface SelfOrderCategory {
  id: number;
  name: string;
  slug: string;
}

export interface SelfOrderProduct {
  id: number;
  name: string;
  description: string | null;
  price: number | string;
  tax_id: number | null;
  product_category_id: number | null;
  tax?: SelfOrderTax | null;
  category?: SelfOrderCategory | null;
}

export interface SelfOrderContext {
  table: { label: string; room_name: string | null };
  products: SelfOrderProduct[];
}

export interface SelfOrderLinePayload {
  product_id: number;
  quantity: number;
  note?: string | null;
}

export interface SelfOrderPayload {
  number_of_guests?: number | null;
  lines: SelfOrderLinePayload[];
}

export interface SelfOrderResponse {
  order_id: number;
}
