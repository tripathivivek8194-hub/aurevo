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
});
