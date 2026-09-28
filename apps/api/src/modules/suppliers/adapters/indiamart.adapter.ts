import { Injectable, HttpException } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import {
  SupplierCode,
  SupplierCredentials,
  AuthResult,
  SearchQuery,
  ProductSearchResult,
  SupplierProduct,
  SupplierVariant,
  InventoryResult,
  PriceResult,
  SupplierOrderRequest,
  SupplierOrderResult,
  OrderStatusResult,
  TrackingResult,
} from '@aurevo/shared/types';
import { SupplierAdapter } from './supplier.adapter';

@Injectable()
export class IndiaMARTAdapter implements SupplierAdapter {
  readonly code: SupplierCode = SupplierCode.INDIAMART;
  readonly name = 'IndiaMART';

  private readonly baseUrl = 'https://mapi.indiamart.com/wservce';
  private readonly crmId: string;
  private readonly apiKey: string;

  constructor(config: { crmId: string; apiKey: string }) {
    this.crmId = config.crmId;
    this.apiKey = config.apiKey;
  }

  private async request(endpoint: string, params: Record<string, any> = {}) {
    const commonParams = {
      glusr_crm_key: this.apiKey,
      ...params,
    };

    try {
      const response = await axios.get(`${this.baseUrl}/${endpoint}`, { params: commonParams });
      return response.data;
    } catch (error: any) {
      if (error.response?.data?.ERROR) {
        throw new HttpException(
          error.response.data.ERROR || 'IndiaMART API error',
          error.response.status || 500
        );
      }
      throw error;
    }
  }

  async authenticate(credentials: SupplierCredentials): Promise<AuthResult> {
    try {
      // Test with a simple catalog call
      const result = await this.request('catalog/catalogListing', {
        startIndex: 1,
        limit: 1,
      });
      return { success: true, message: 'Authenticated successfully' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  async searchProducts(query: SearchQuery): Promise<ProductSearchResult> {
    const params = {
      query: query.query ?? '',
      startIndex: ((query.page ?? 1) - 1) * (query.limit ?? 20) + 1,
      limit: query.limit ?? 20,
      categoryId: query.categoryId,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
    };

    const result = await this.request('catalog/catalogListing', params);

    const products = result?.CATALOG?.map((cat: any) => this.transformProduct(cat)) ?? [];

    return {
      products,
      total: result?.TOTAL_COUNT ?? products.length,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };
  }

  async getProduct(supplierProductId: string): Promise<SupplierProduct> {
    const result = await this.request('catalog/catalogDetail', {
      productId: supplierProductId,
    });

    const product = result?.CATALOG?.[0];
    if (!product) {
      throw new HttpException('Product not found', 404);
    }

    return this.transformProduct(product);
  }

  async getVariants(supplierProductId: string): Promise<SupplierVariant[]> {
    const product = await this.getProduct(supplierProductId);
    // IndiaMART products typically don't have variants in the same way
    return product.variants ?? [];
  }

  async getInventory(supplierProductId: string, variantIds?: string[]): Promise<InventoryResult> {
    // IndiaMART doesn't provide real-time inventory via API
    // This would typically need manual updates or a different integration
    return {
      productId: supplierProductId,
      variants: [],
      note: 'Inventory sync not available via IndiaMART API',
    };
  }

  async getPrice(supplierProductId: string, variantIds?: string[]): Promise<PriceResult> {
    const product = await this.getProduct(supplierProductId);

    return {
      productId: supplierProductId,
      basePrice: product.price?.amount ?? 0,
      currency: product.price?.currency ?? 'INR',
      variants: [],
    };
  }

  async createOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    // IndiaMART is primarily a lead generation platform, not an order fulfillment platform
    // Orders typically go through inquiry/lead flow, not direct order placement
    throw new HttpException(
      'IndiaMART does not support direct order creation. Use inquiry/lead flow instead.',
      400
    );
  }

  async getOrderStatus(supplierOrderId: string): Promise<OrderStatusResult> {
    // IndiaMART doesn't have order status tracking via API
    throw new HttpException(
      'Order status tracking not available via IndiaMART API',
      400
    );
  }

  async getTracking(supplierOrderId: string): Promise<TrackingResult> {
    // IndiaMART doesn't provide tracking via API
    return { supplierOrderId, events: [] };
  }

  verifyWebhook(payload: any, signature: string): boolean {
    // IndiaMART webhook verification (if applicable)
    const expectedSign = crypto
      .createHmac('sha256', this.apiKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    return expectedSign === signature;
  }

  private transformProduct(product: any): SupplierProduct {
    return {
      id: product.PRODUCT_ID,
      title: product.PRODUCT_NAME,
      description: product.PRODUCT_DESCRIPTION,
      price: {
        amount: this.parsePrice(product.PRICE) ?? 0,
        currency: 'INR',
      },
      originalPrice: {
        amount: this.parsePrice(product.ORIGINAL_PRICE) ?? 0,
        currency: 'INR',
      },
      images: product.IMAGES?.map((img: any) => img.IMAGE_URL) ?? [],
      categoryId: product.CATEGORY_ID,
      categoryName: product.CATEGORY_NAME,
      variants: product.VARIANTS?.map((v: any) => ({
        id: v.VARIANT_ID,
        productId: product.PRODUCT_ID,
        attributes: v.ATTRIBUTES ?? {},
        price: this.parsePrice(v.PRICE) ?? 0,
        inventory: v.STOCK ?? 0,
        barcode: v.SKU,
      })) ?? [],
      specifications: product.SPECIFICATIONS,
      unit: product.UNIT,
      minOrderQuantity: product.MIN_ORDER_QUANTITY ?? 1,
    };
  }

  private parsePrice(priceStr: string): number | null {
    if (!priceStr) return null;
    const match = priceStr.match(/[\d,]+\.?\d*/);
    return match ? parseFloat(match[0].replace(/,/g, '')) : null;
  }
}