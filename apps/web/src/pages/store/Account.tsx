import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
  Skeleton,
  Switch,
} from '@aurevo/design-system';
import { useSeo } from '../../hooks/useSeo';
import { useAuthStore } from '../../stores/auth';
import { api } from '../../lib/api';
import { formatMoney, formatDate, initialsof } from '../../lib/format';
import type { Address, OrderStats } from '../../lib/storefront';

type NotificationPreferences = {
  emailOrderUpdates: boolean;
  emailPromotions: boolean;
};

/* ------------------------------------------------------------------ */
/* Inline address form                                                 */
/* ------------------------------------------------------------------ */

const EMPTY_ADDRESS = {
  firstName: '',
  lastName: '',
  company: '',
  address1: '',
  address2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'IN',
  phone: '',
  isDefault: false,
  type: 'SHIPPING' as 'SHIPPING' | 'BILLING',
};

function AddressForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Address;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(
    initial ? { ...initial } : { ...EMPTY_ADDRESS },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const set = (key: string, value: string | boolean) =>
    setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (initial) {
        await api.patch(`/users/me/addresses/${initial.id}`, form);
      } else {
        await api.post('/users/me/addresses', form);
      }

      void queryClient.invalidateQueries({ queryKey: ['addresses'] });
      onSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save address',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="a-first">First name</Label>
          <Input
            id="a-first"
            autoComplete="given-name"
            required
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="a-last">Last name</Label>
          <Input
            id="a-last"
            autoComplete="family-name"
            required
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="a-addr1">Address line 1</Label>
        <Input
          id="a-addr1"
          autoComplete="address-line1"
          required
          value={form.address1}
          onChange={(e) => set('address1', e.target.value)}
          className="h-11"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="a-addr2">Address line 2</Label>
        <Input
          id="a-addr2"
          autoComplete="address-line2"
          value={form.address2 ?? ''}
          onChange={(e) => set('address2', e.target.value)}
          className="h-11"
        />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          Optional
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="a-city">City</Label>
          <Input
            id="a-city"
            autoComplete="address-level2"
            required
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="a-state">State</Label>
          <Input
            id="a-state"
            autoComplete="address-level1"
            required
            value={form.state}
            onChange={(e) => set('state', e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="a-postal">Postal code</Label>
          <Input
            id="a-postal"
            autoComplete="postal-code"
            required
            value={form.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
            className="h-11"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="a-phone">Phone</Label>
          <Input
            id="a-phone"
            type="tel"
            autoComplete="tel"
            required
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="a-country">Country code</Label>
        <Input
          id="a-country"
          required
          maxLength={2}
          value={form.country}
          onChange={(e) =>
            set('country', e.target.value.toUpperCase())
          }
          className="h-11"
        />
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-4">
        <Switch
          label="Set as default address"
          checked={form.isDefault}
          onChange={(value) => set('isDefault', value)}
        />
      </div>

      <div className="flex flex-col gap-3 pt-1 sm:flex-row">
        <Button
          type="submit"
          variant="primary"
          disabled={saving}
          className="h-11"
        >
          {saving
            ? 'Saving...'
            : initial
              ? 'Update address'
              : 'Add address'}
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
          className="h-11"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Main Account page                                                   */
/* ------------------------------------------------------------------ */

export function Account() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(null);

  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] =
    useState<Address | undefined>(undefined);

  useSeo({
    title: 'My Account | AUREVO',
    description:
      'Manage your AUREVO profile, orders, and account settings.',
    noindex: true,
  });

  const statsQuery = useQuery({
    queryKey: ['orders', 'me', 'stats'],
    queryFn: () =>
      api.get<OrderStats>('/orders/me/stats').then((r) => r.data),
  });

  const addressesQuery = useQuery({
    queryKey: ['addresses'],
    queryFn: () =>
      api.get<Address[]>('/users/me/addresses').then((r) => r.data),
  });

  const preferencesQuery = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () =>
      api.get<NotificationPreferences>('/users/me').then((r) => ({
        emailOrderUpdates: r.data.emailOrderUpdates,
        emailPromotions: r.data.emailPromotions,
      })),
    enabled: Boolean(user),
  });

  const preferencesMutation = useMutation({
    mutationFn: (preferences: Partial<NotificationPreferences>) =>
      api.patch<NotificationPreferences>('/users/me/notification-preferences', preferences),
    onSuccess: (response) => {
      queryClient.setQueryData(['notification-preferences'], response.data);
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: (addressId: string) =>
      api.delete(`/users/me/addresses/${addressId}`),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (addressId: string) =>
      api.post(`/users/me/addresses/${addressId}/default`),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['addresses'] }),
  });

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const startEdit = () => {
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setError(null);
    setSaved(false);
    setEditing(true);
  };

  const cancelEdit = () => {
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setError(null);
    setEditing(false);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);

    try {
      const res = await api.patch<{
        firstName: string;
        lastName: string;
      }>('/users/me', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });

      updateUser({
        firstName: res.data.firstName,
        lastName: res.data.lastName,
      });

      setEditing(false);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not save profile',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleResendVerification = async () => {
    setVerificationNotice(null);
    setResendingVerification(true);

    try {
      await api.post('/auth/resend-verification', { email: user.email });
      setVerificationNotice('A fresh verification link has been sent to your email address.');
    } catch (err) {
      setVerificationNotice(
        err instanceof Error
          ? err.message
          : 'We could not send the verification email. Please try again.',
      );
    } finally {
      setResendingVerification(false);
    }
  };

  const stats = statsQuery.data;
  const addresses = addressesQuery.data ?? [];
  const preferences = preferencesQuery.data ?? {
    emailOrderUpdates: true,
    emailPromotions: false,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-6 sm:p-8 lg:p-10">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/[0.025] blur-3xl" />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">
            YOUR AUREVO
          </p>

          <div className="mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
                My account
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
                Manage your profile, orders, saved addresses and
                preferences in one place.
              </p>
            </div>

            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] text-lg font-semibold text-[var(--color-text-primary)]">
              {initialsof(user.firstName, user.lastName)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <nav className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-2">
            <Link
              to="/account"
              className="flex items-center justify-between rounded-xl bg-[var(--color-background-primary)] px-4 py-3 text-sm font-medium text-[var(--color-text-primary)] shadow-sm"
            >
              <span>Account overview</span>
              <span aria-hidden="true">→</span>
            </Link>

            <Link
              to="/account/orders"
              className="mt-1 flex items-center justify-between rounded-xl px-4 py-3 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]"
            >
              <span>My orders</span>
              <span aria-hidden="true">→</span>
            </Link>

            <Link
              to="/account/wishlist"
              className="mt-1 flex items-center justify-between rounded-xl px-4 py-3 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-background-hover)] hover:text-[var(--color-text-primary)]"
            >
              <span>Wishlist</span>
              <span aria-hidden="true">→</span>
            </Link>
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 w-full rounded-2xl border border-[var(--color-border)] px-4 py-3 text-left text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:border-red-400/30 hover:bg-red-500/[0.04] hover:text-red-400"
          >
            Log out
          </button>
        </aside>

        {/* Main content */}
        <div className="min-w-0 space-y-6">
          {/* Profile */}
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-interactive-primary)] text-xl font-semibold text-white">
                {initialsof(user.firstName, user.lastName)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Profile
                </p>

                <h2 className="mt-1 truncate text-xl font-semibold text-[var(--color-text-primary)]">
                  {user.firstName} {user.lastName}
                </h2>

                <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                  {user.email}
                </p>
              </div>

              {!editing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEdit}
                  className="shrink-0"
                >
                  Edit profile
                </Button>
              )}
            </div>

            {saved && (
              <Alert variant="success" className="mt-5">
                Profile updated successfully.
              </Alert>
            )}

            {error && (
              <Alert variant="error" className="mt-5">
                {error}
              </Alert>
            )}

            {editing ? (
              <form
                onSubmit={handleSave}
                className="mt-6 space-y-5 border-t border-[var(--color-border)] pt-6"
              >
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First name</Label>
                    <Input
                      id="firstName"
                      autoComplete="given-name"
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last name</Label>
                    <Input
                      id="lastName"
                      autoComplete="family-name"
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={user.email}
                    disabled
                    className="h-11"
                  />
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    Email cannot be changed from this page.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    disabled={saving}
                    className="h-11"
                  >
                    {saving ? 'Saving...' : 'Save changes'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    disabled={saving}
                    className="h-11"
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-1 gap-3 border-t border-[var(--color-border)] pt-6 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-4">
                  <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Member since
                  </p>
                  <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
                    {formatDate(user.createdAt)}
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-4">
                  <p className="text-xs uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Email verified
                  </p>
                  <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">
                    {user.emailVerified ? 'Yes' : 'No'}
                  </p>
                  {!user.emailVerified && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleResendVerification()}
                      disabled={resendingVerification}
                      className="mt-4 w-full"
                    >
                      {resendingVerification
                        ? 'Sending…'
                        : 'Resend verification email'}
                    </Button>
                  )}
                </div>
                </div>

                {verificationNotice && (
                  <Alert
                    variant={verificationNotice.startsWith('A fresh') ? 'success' : 'error'}
                    className="mt-4"
                  >
                    {verificationNotice}
                  </Alert>
                )}
              </>
            )}
          </section>

          {/* Order summary */}
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Your activity
                </p>

                <h2 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">
                  Order summary
                </h2>
              </div>

              <Link
                to="/account/orders"
                className="text-sm font-medium text-[var(--color-interactive-primary)] hover:opacity-75"
              >
                View all orders →
              </Link>
            </div>

            {statsQuery.isLoading ? (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Total orders
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                    {stats?.totalOrders ?? 0}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Total spent
                  </p>
                  <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
                    {formatMoney(stats?.totalSpent ?? 0)}
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                    Last order
                  </p>

                  {stats?.lastOrderAt ? (
                    <>
                      <p className="mt-3 text-base font-semibold text-[var(--color-text-primary)]">
                        {new Date(
                          stats.lastOrderAt,
                        ).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>

                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        {new Date(
                          stats.lastOrderAt,
                        ).toLocaleTimeString('en-IN', {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-lg font-semibold text-[var(--color-text-secondary)]">
                      No orders yet
                    </p>
                  )}
                </div>
              </div>
            )}

            <Link to="/account/orders" className="mt-5 inline-block">
              <Button variant="outline" size="sm">
                View order history →
              </Button>
            </Link>
          </section>

          {/* Saved addresses */}
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  CHECKOUT
                </p>

                <h2 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">
                  Saved addresses
                </h2>

                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  Keep your delivery details ready for faster checkout.
                </p>
              </div>

              {!addressFormOpen && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingAddress(undefined);
                    setAddressFormOpen(true);
                  }}
                  className="shrink-0"
                >
                  + Add address
                </Button>
              )}
            </div>

            {addressFormOpen && (
              <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5 sm:p-6">
                <div className="mb-5">
                  <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                    {editingAddress ? 'Edit address' : 'New address'}
                  </h3>

                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    {editingAddress
                      ? 'Update your saved delivery information.'
                      : 'Add an address for faster checkout.'}
                  </p>
                </div>

                <AddressForm
                  initial={editingAddress}
                  onSaved={() => {
                    setAddressFormOpen(false);
                    setEditingAddress(undefined);
                  }}
                  onCancel={() => {
                    setAddressFormOpen(false);
                    setEditingAddress(undefined);
                  }}
                />
              </div>
            )}

            {addressesQuery.isLoading ? (
              <div className="mt-6 space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>
            ) : addresses.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-background-primary)] text-[var(--color-text-secondary)]">
                  +
                </div>

                <h3 className="mt-4 text-sm font-semibold text-[var(--color-text-primary)]">
                  No saved addresses
                </h3>

                <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-[var(--color-text-secondary)]">
                  Add your delivery address to make your next checkout
                  quicker.
                </p>

                {!addressFormOpen && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-5"
                    onClick={() => {
                      setEditingAddress(undefined);
                      setAddressFormOpen(true);
                    }}
                  >
                    Add your first address
                  </Button>
                )}
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 gap-4">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)] p-5"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--color-text-primary)]">
                            {addr.firstName} {addr.lastName}
                          </span>

                          {addr.isDefault && (
                            <Badge variant="success" size="sm">
                              Default
                            </Badge>
                          )}

                          <Badge variant="default" size="sm">
                            {addr.type}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-1 text-[var(--color-text-secondary)]">
                          <p>
                            {addr.address1}
                            {addr.address2
                              ? `, ${addr.address2}`
                              : ''}
                          </p>

                          <p>
                            {addr.city}, {addr.state}{' '}
                            {addr.postalCode}
                          </p>

                          <p>
                            {addr.country} · {addr.phone}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {!addr.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDefaultMutation.mutate(addr.id)
                            }
                            disabled={setDefaultMutation.isPending}
                          >
                            Set default
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingAddress(addr);
                            setAddressFormOpen(true);
                          }}
                        >
                          Edit
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (
                              window.confirm(
                                'Delete this address?',
                              )
                            ) {
                              deleteAddressMutation.mutate(addr.id);
                            }
                          }}
                          disabled={deleteAddressMutation.isPending}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Notifications */}
          <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-7">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                PREFERENCES
              </p>

              <h2 className="mt-1 text-xl font-semibold text-[var(--color-text-primary)]">
                Notification preferences
              </h2>

              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Choose how you'd like AUREVO to keep you updated.
              </p>
            </div>

            <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
              Your choices save automatically. Order updates are sent only when you keep them enabled.
            </p>

            {preferencesMutation.isError && (
              <Alert variant="error" className="mt-5">
                We could not save your notification preferences. Please try again.
              </Alert>
            )}

            <div className="mt-5 divide-y divide-[var(--color-border)] rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-primary)]">
              <div className="p-4 sm:p-5">
                <Switch
                  label="Order status updates"
                  checked={preferences.emailOrderUpdates}
                  onChange={(emailOrderUpdates) =>
                    preferencesMutation.mutate({ emailOrderUpdates })
                  }
                  disabled={preferencesQuery.isLoading || preferencesMutation.isPending}
                />
                <p className="mt-2 pl-0 text-xs text-[var(--color-text-tertiary)] sm:pl-0">
                  Receive updates about your orders and deliveries.
                </p>
              </div>

              <div className="p-4 sm:p-5">
                <Switch
                  label="Promotions and new arrivals"
                  checked={preferences.emailPromotions}
                  onChange={(emailPromotions) =>
                    preferencesMutation.mutate({ emailPromotions })
                  }
                  disabled={preferencesQuery.isLoading || preferencesMutation.isPending}
                />
                <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">
                  Hear about new products and special offers.
                </p>
              </div>
            </div>
          </section>

          {/* Security footer */}
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-[var(--color-text-tertiary)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.6}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3l7 3v5c0 4.8-3 8.5-7 10-4-1.5-7-5.2-7-10V6l7-3z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.5 12l1.7 1.7 3.5-3.7"
              />
            </svg>
            <span>Your AUREVO account is protected.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
