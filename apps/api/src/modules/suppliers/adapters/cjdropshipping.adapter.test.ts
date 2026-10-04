import { CJDropshippingAdapter } from './cjdropshipping.adapter';

describe('CJDropshippingAdapter inventory', () => {
  const tokenStore = {
    getTokens: jest.fn().mockResolvedValue({ accessToken: 'token' }),
    saveTokens: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sums the documented queryByVid warehouse quantities', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          code: 200,
          result: true,
          data: [
            { vid: 'v1', totalInventoryNum: 12 },
            { vid: 'v1', totalInventoryNum: 8 },
          ],
        },
      }),
      post: jest.fn(),
    } as any;
    const adapter = new CJDropshippingAdapter({
      apiKey: 'key',
      tokenStore,
      http,
    });

    await expect(adapter.getInventory('p1', ['v1'])).resolves.toEqual({
      productId: 'p1',
      variants: [{ variantId: 'v1', quantity: 20, available: true }],
    });
  });

  it('rejects an empty stock response instead of fabricating zero', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        status: 200,
        data: { code: 200, result: true, data: [] },
      }),
      post: jest.fn(),
    } as any;
    const adapter = new CJDropshippingAdapter({
      apiKey: 'key',
      tokenStore,
      http,
    });

    await expect(adapter.getInventory('p1', ['v1'])).rejects.toThrow('no verifiable inventory');
  });

  it('confirms India shipping when CJ returns a freight method', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          code: 200,
          data: {
            variantInventories: [
              { vid: 'v1', inventory: [{ countryCode: 'CN', totalInventory: 25 }] },
            ],
          },
        },
      }),
      post: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          code: 200,
          data: [{ logisticName: 'CJPacket', logisticPrice: 5.2 }],
        },
      }),
    } as any;
    const adapter = new CJDropshippingAdapter({ apiKey: 'key', tokenStore, http });

    await expect(adapter.getShippingAvailability('p1', 'in')).resolves.toMatchObject({
      status: 'AVAILABLE',
      country: 'IN',
    });
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/logistic/freightCalculate'),
      expect.objectContaining({
        startCountryCode: 'CN',
        endCountryCode: 'IN',
        products: [{ quantity: 1, vid: 'v1' }],
      }),
      expect.any(Object),
    );
  });

  it('marks India unavailable only after every stocked origin returns no route', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          code: 200,
          data: {
            variantInventories: [
              { vid: 'v1', inventory: [{ countryCode: 'CN', totalInventory: 25 }] },
              { vid: 'v2', inventory: [{ countryCode: 'US', totalInventory: 10 }] },
            ],
          },
        },
      }),
      post: jest.fn().mockResolvedValue({ status: 200, data: { code: 200, data: [] } }),
    } as any;
    const adapter = new CJDropshippingAdapter({ apiKey: 'key', tokenStore, http });

    await expect(adapter.getShippingAvailability('p1', 'IN')).resolves.toMatchObject({
      status: 'UNAVAILABLE',
      country: 'IN',
    });
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('keeps CJ shipping unknown when the freight check fails', async () => {
    const http = {
      get: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          code: 200,
          data: {
            variantInventories: [
              { vid: 'v1', inventory: [{ countryCode: 'CN', totalInventory: 25 }] },
            ],
          },
        },
      }),
      post: jest.fn().mockRejectedValue(new Error('temporary failure')),
    } as any;
    const adapter = new CJDropshippingAdapter({ apiKey: 'key', tokenStore, http });

    await expect(adapter.getShippingAvailability('p1', 'IN')).resolves.toMatchObject({
      status: 'UNKNOWN',
      country: 'IN',
    });
  });
});
