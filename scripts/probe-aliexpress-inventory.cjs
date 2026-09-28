const { AliExpressAdapter } = require('/app/apps/api/dist/modules/suppliers/adapters/aliexpress.adapter.js');

async function main() {
  const productId = process.argv[2];
  if (!productId) throw new Error('Product id is required');

  const adapter = new AliExpressAdapter({
    appKey: process.env.ALIEXPRESS_APP_KEY,
    appSecret: process.env.ALIEXPRESS_APP_SECRET,
    accessToken: process.env.ALIEXPRESS_ACCESS_TOKEN,
  });
  const product = await adapter.getProductDetail(productId, 'IN', {
    targetCurrency: 'INR',
    targetLanguage: 'EN',
  });
  const stocks = (product.skus ?? []).map((sku) => Number(sku.sku_stock ?? 0));
  console.log(JSON.stringify({
    productId,
    returnedId: product.id,
    titlePresent: Boolean(product.title),
    skuCount: stocks.length,
    totalStock: stocks.reduce((sum, stock) => sum + stock, 0),
    minStock: stocks.length ? Math.min(...stocks) : null,
    maxStock: stocks.length ? Math.max(...stocks) : null,
  }));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
