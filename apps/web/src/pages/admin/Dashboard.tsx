import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton, Table,
} from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatMoney, initialsof } from '../../lib/format';

interface DashboardData {
  overview: {
    totalUsers: number; totalOrders: number; totalRevenue: number; totalProducts: number;
    pendingOrders: number; lowStockCount: number;
  };
  trends: {
    revenueLast7Days: number; revenueLast30Days: number;
    ordersLast7Days: number; ordersLast30Days: number;
    usersLast7Days: number; usersLast30Days: number;
  };
  charts: { revenueByDay: { date: string; revenue: number }[]; ordersByStatus: { status: string; count: number }[] };
  topProducts: { productId: string; _sum: { totalPrice: number; quantity: number }; product: { name: string; sku: string } | null }[];
  topCustomers: { userId: string; _sum: { total: number }; _count: { id: number }; user: { email: string; firstName: string; lastName: string } | null }[];
  recentOrders: { id: string; orderNumber: string; total: number; status: string; createdAt: string; user: { email: string; firstName: string; lastName: string } | null }[];
}

const statusVariant: Record<string, 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'> = {
  DELIVERED: 'success', PAID: 'success', PAYMENT_PENDING: 'warning',
  PROCESSING: 'info', PENDING: 'info', SHIPPED: 'info',
  CANCELLED: 'error', FAILED: 'error', REFUNDED: 'error', RETURNED: 'error',
};

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="text-xs text-[var(--color-text-secondary)] mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => api.get<DashboardData>('/admin/dashboard').then((r) => r.data),
  });

  if (isError) {
    return (
      <div className="text-sm text-[var(--color-status-error)]">
        Failed to load dashboard: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">Store overview from live data</p>
      </header>

      {isLoading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <Kpi label="Orders" value={String(data.overview.totalOrders)} hint={`${data.trends.ordersLast7Days} in 7d`} />
            <Kpi label="Revenue" value={formatMoney(data.overview.totalRevenue)} hint={`7d ${formatMoney(data.trends.revenueLast7Days)}`} />
            <Kpi label="Customers" value={String(data.overview.totalUsers)} hint={`${data.trends.usersLast7Days} in 7d`} />
            <Kpi label="Products" value={String(data.overview.totalProducts)} hint="active" />
            <Kpi label="Pending orders" value={String(data.overview.pendingOrders)} />
            <Kpi label="Low stock" value={String(data.overview.lowStockCount)} />
          </div>

          {/* Revenue chart */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Revenue · last 30 days</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {data.charts.revenueByDay.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No revenue data yet.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.charts.revenueByDay} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(value) => formatMoney(Number(value))} />
                      <Line type="monotone" dataKey="revenue" stroke="var(--color-interactive-primary)" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent orders */}
          <Card>
            <CardHeader>
              <CardTitle as="h2">Recent orders</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table
                data={data.recentOrders}
                keyExtractor={(o) => o.id}
                emptyMessage="No orders yet."
                columns={[
                  { key: 'orderNumber', header: 'Order', render: (o) => <span className="font-medium">{o.orderNumber}</span> },
                  { key: 'customer', header: 'Customer', render: (o) => (o.user ? `${o.user.firstName} ${o.user.lastName}` : 'Guest') },
                  { key: 'total', header: 'Total', render: (o) => formatMoney(o.total) },
                  { key: 'status', header: 'Status', render: (o) => <Badge variant={statusVariant[o.status] ?? 'default'}>{o.status}</Badge> },
                ]}
              />
            </CardContent>
          </Card>

          {/* Top products + top customers */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle as="h2">Top products</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table
                  data={data.topProducts}
                  keyExtractor={(p) => p.productId}
                  emptyMessage="No product sales yet."
                  columns={[
                    { key: 'name', header: 'Product', render: (p) => <span className="font-medium">{p.product?.name ?? p.productId}</span> },
                    { key: 'sku', header: 'SKU', render: (p) => p.product?.sku },
                    { key: 'qty', header: 'Sold', render: (p) => p._sum.quantity },
                    { key: 'revenue', header: 'Revenue', render: (p) => formatMoney(p._sum.totalPrice) },
                  ]}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h2">Top customers</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table
                  data={data.topCustomers}
                  keyExtractor={(c) => c.userId}
                  emptyMessage="No customer data yet."
                  columns={[
                    {
                      key: 'name', header: 'Customer',
                      render: (c) => (
                        <span>
                          <span className="mr-2 text-[var(--color-text-secondary)]">
                            {initialsof(c.user?.firstName, c.user?.lastName)}
                          </span>
                          {c.user ? `${c.user.firstName} ${c.user.lastName}` : c.userId}
                        </span>
                      ),
                    },
                    { key: 'orders', header: 'Orders', render: (c) => c._count.id },
                    { key: 'spent', header: 'Spent', render: (c) => formatMoney(c._sum.total) },
                  ]}
                />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
