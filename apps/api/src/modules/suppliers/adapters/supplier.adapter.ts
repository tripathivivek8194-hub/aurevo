import { SupplierCode, SupplierCredentials, AuthResult, SearchQuery, ProductSearchResult, SupplierProduct, SupplierVariant, InventoryResult, PriceResult, SupplierOrderRequest, SupplierOrderResult, OrderStatusResult, TrackingResult } from '@aurevo/shared/types';

export interface SupplierAdapter {
  readonly code: SupplierCode;
  readonly name: string;
  authenticate(credentials: SupplierCredentials): Promise<AuthResult>;
  searchProducts(query: SearchQuery): Promise<ProductSearchResult>;
  getProduct(supplierProductId: string): Promise<SupplierProduct>;
  getVariants(supplierProductId: string): Promise<SupplierVariant[]>;
  getInventory(supplierProductId: string, variantIds?: string[]): Promise<InventoryResult>;
  getPrice(supplierProductId: string, variantIds?: string[]): Promise<PriceResult>;
  createOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult>;
  getOrderStatus(supplierOrderId: string): Promise<OrderStatusResult>;
  getTracking(supplierOrderId: string): Promise<TrackingResult>;
  verifyWebhook(payload: any, signature: string): boolean;
}