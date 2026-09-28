import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Input, Label, Table, type Column } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';

/* Date helpers (local dates, sent as YYYY-MM-DD) */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDate(d);
}
const today = () => isoDate(new Date());

interface RevenueSummary { totalRevenue: number; totalOrders: number; avgOrderValue: number }
interface RevenueResponse { summary: RevenueSummary; daily: { date: string; revenue: number; orders: number; aov: number }[] }
interface CustomerResponse { newCustomers: number; returningCustomers: number; totalCustomers: number; averageLifetimeValue: number; repeatPurchaseRate: number }
interface FunnelResponse {
  sessions: number;
  productViews: number;
  addToCarts: number;
  checkoutsStarted: number;
  ordersPlaced: number;
  conversionRates: { viewToCart: number; cartToCheckout: number; checkoutToOrder: number; overall: number };
}
interface TrafficSource { source: string; sessions: number }
interface ProductAnalytics {
  topSelling: { productId: string; _sum: { quantity: number; totalPrice: number }; _count: { id: number }; product?: { name: string; sku: string } | null }[];
  topRevenue: { productId: string; _sum: { totalPrice: number } }[];
  lowStock: { id: string; quantity: number; product?: { name: string; sku: string } | null; variant?: { name: string } | null }[];
  outOfStock: { id: string; quantity: number; product?: { name: string; sku: string } | null; variant?: { name: string } | null }[];
}

export function Analytics() {
  const [startDate, setStartDate] = useState(daysAgo(30));
  const [endDate, setEndDate] = useState(today());

  const params = { startDate, endDate };

  const revenueQuery = useQuery({
    queryKey: ['admin', 'analytics', 'revenue', startDate, endDate],
    queryFn: () => api.get<RevenueResponse>('/analytics/revenue', { params }).then((r) => r.data),
    enabled: !!startDate && !!endDate,
  });
  const customersQuery = useQuery({
    queryKey: ['admin', 'analytics', 'customers', startDate, endDate],
    queryFn: () => api.get<CustomerResponse>('/analytics/customers', { params }).then((r) => r.data),
    enabled: !!startDate && !!endDate,
  });
  const productsQuery = useQuery({
    queryKey: ['admin', 'analytics', 'products', startDate, endDate],
    queryFn: () => api.get<ProductAnalytics>('/analytics/products', { params }).then((r) => r.data),
    enabled: !!startDate && !!endDate,
  });
  const funnelQuery = useQuery({
    queryKey: ['admin', 'analytics', 'funnel', startDate, endDate],
    queryFn: () => api.get<FunnelResponse>('/analytics/funnel', { params }).then((r) => r.data),
    enabled: !!startDate && !!endDate,
  });
  const trafficQuery = useQuery({
    queryKey: ['admin', 'analytics', 'traffic'],
    queryFn: () => api.get<TrafficSource[]>('/analytics/traffic').then((r) => r.data),
  });

  const revenue = revenueQuery.data;
  const customers = customersQuery.data;
  const products = productsQuery.data;
  const funnel = funnelQuery.data;
  const traffic = trafficQuery.data ?? [];
  const loading = revenueQuery.isLoading || customersQuery.isLoading || productsQuery.isLoading || funnelQuery.isLoading || trafficQuery.isLoading;

  const topSellingColumns: Column<ProductAnalytics['topSelling'][number]>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (p) => (
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{p.product?.name ?? p.productId}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">{p.product?.sku}</p>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Units sold',
      render: (p) => <span className="text-sm tabular-nums text-[var(--color-text-primary)]">{p._sum.quantity}</span>,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      render: (p) => <span className="text-sm tabular-nums text-[var(--color-text-primary)]">{formatMoney(p._sum.totalPrice)}</span>,
    },
  ];

  const lowStockColumns: Column<ProductAnalytics['lowStock'][number]>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (p) => (
        <div>
          <p className="text-sm font-medium text-[var(--color-text-primary)]">{p.product?.name ?? p.id}</p>
          <p className="text-xs text-[var(--color-text-tertiary)]">{p.product?.sku}{p.variant?.name ? ` · ${p.variant.name}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'On hand',
      render: (p) => <span className="text-sm tabular-nums text-[var(--color-text-primary)]">{p.quantity}</span>,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">Analytics</h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Real figures from your order and customer data</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="an-start">From</Label>
            <Input id="an-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="an-end">To</Label>
            <Input id="an-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => { setStartDate(daysAgo(30)); setEndDate(today()); }}>
            Last 30 days
          </Button>
        </div>
      </div>

      <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
        Showing {startDate} → {endDate} (UTC day boundaries).
      </p>

      {loading && <Alert variant="info" className="mt-4">Loading real analytics…</Alert>}

      {!loading && (revenueQuery.error || customersQuery.error || productsQuery.error || funnelQuery.error || trafficQuery.error) && (
        <Alert variant="error" className="mt-4">
          Could not load analytics for the selected range.
        </Alert>
      )}

      {!loading && revenue && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Total revenue', value: formatMoney(revenue.summary.totalRevenue), sub: `${revenue.summary.totalOrders} order${revenue.summary.totalOrders === 1 ? '' : 's'}` },
            { label: 'Average order value', value: formatMoney(revenue.summary.avgOrderValue), sub: 'per order' },
            { label: 'Repeat purchase rate', value: customers ? `${customers.repeatPurchaseRate.toFixed(1)}%` : '—', sub: 'of customers with orders' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[var(--color-border)] p-4">
              <p className="text-xs text-[var(--color-text-secondary)]">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-[var(--color-text-primary)]">{s.value}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-tertiary)]">{s.sub}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && funnel && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Conversion funnel</h2>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Unique first-party visitors for each measured stage</p>
            </div>
            <p className="text-sm font-semibold text-[var(--color-interactive-primary)]">{funnel.conversionRates.overall.toFixed(1)}% session to order</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ['Sessions', funnel.sessions],
              ['Product views', funnel.productViews],
              ['Added to cart', funnel.addToCarts],
              ['Checkout started', funnel.checkoutsStarted],
              ['Orders', funnel.ordersPlaced],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-[var(--color-background-secondary)] p-3">
                <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--color-text-primary)]">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--color-text-tertiary)]">
            <span>View → cart {funnel.conversionRates.viewToCart.toFixed(1)}%</span>
            <span>Cart → checkout {funnel.conversionRates.cartToCheckout.toFixed(1)}%</span>
            <span>Checkout → order {funnel.conversionRates.checkoutToOrder.toFixed(1)}%</span>
          </div>
        </div>
      )}

      {!loading && traffic.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Traffic sources</h2>
          <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">Unique sessions during the last 30 days</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {traffic.map((item) => (
              <div key={item.source} className="rounded-lg bg-[var(--color-background-secondary)] p-3">
                <p className="text-xs capitalize text-[var(--color-text-secondary)]">{item.source.toLowerCase().replace(/_/g, ' ')}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-[var(--color-text-primary)]">{item.sessions}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Customers */}
      {!loading && customers && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Customers</h2>
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">New</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--color-text-primary)]">{customers.newCustomers}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Returning</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--color-text-primary)]">{customers.returningCustomers}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Total customers</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--color-text-primary)]">{customers.totalCustomers}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Avg lifetime value</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--color-text-primary)]">{formatMoney(customers.averageLifetimeValue)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Revenue daily chart (simple bars) */}
      {!loading && revenue && revenue.daily.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Daily revenue</h2>
          <div className="mt-3 flex items-end gap-1 h-32">
            {revenue.daily.map((d) => {
              const max = Math.max(...revenue.daily.map((x) => x.revenue), 1);
              const h = Math.max(4, Math.round((d.revenue / max) * 100));
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-end group" title={`${d.date}: ${formatMoney(d.revenue)}`}>
                  <div className="w-full max-w-[18px] rounded-t bg-[var(--color-interactive-primary)] transition-all group-hover:opacity-80" style={{ height: `${h}%` }} />
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">{revenue.daily.length} day{revenue.daily.length === 1 ? '' : 's'} · {revenue.daily[0].date} → {revenue.daily[revenue.daily.length - 1].date}</p>
        </div>
      )}

      {/* Top selling */}
      {!loading && products && products.topSelling.length > 0 && (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Top selling products</h2>
          <div className="mt-3">
            <Table columns={topSellingColumns} data={products.topSelling} keyExtractor={(p) => p.productId} />
          </div>
        </div>
      )}

      {/* Low / out of stock */}
      {!loading && products && (products.lowStock.length > 0 || products.outOfStock.length > 0) && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {products.lowStock.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Low stock</h2>
                <Badge variant="warning" size="sm">{products.lowStock.length}</Badge>
              </div>
              <div className="mt-3">
                <Table columns={lowStockColumns} data={products.lowStock} keyExtractor={(p) => p.id} />
              </div>
            </div>
          )}
          {products.outOfStock.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Out of stock</h2>
                <Badge variant="error" size="sm">{products.outOfStock.length}</Badge>
              </div>
              <div className="mt-3">
                <Table columns={lowStockColumns} data={products.outOfStock} keyExtractor={(p) => p.id} />
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && funnel && funnel.sessions === 0 && (
        <p className="mt-6 text-xs text-[var(--color-text-tertiary)]">
          First-party funnel tracking is active. Figures will appear as customers browse the updated storefront.
        </p>
      )}
    </div>
  );
}
