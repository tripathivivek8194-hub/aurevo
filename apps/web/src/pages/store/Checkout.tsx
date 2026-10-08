import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Alert, Button, Skeleton } from '@aurevo/design-system';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { useSeo } from '../../hooks/useSeo';
import { getSessionId } from '../../lib/session';
import { useAuthStore } from '../../stores/auth';
import { useRazorpay } from '../../hooks/useRazorpay';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface AddressFields {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

interface ShippingMethod {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  baseCost: number;
  perItemCost?: number | null;
  estimatedDays: number;
  freeShippingThreshold?: number | null;
}

interface PreviewItem {
  productId: string;
  variantId: string | null;
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface PreviewResponse {
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  currency: string;
  items: PreviewItem[];
  shippingMethod: {
    id: string;
    name: string;
    estimatedDays: number;
  } | null;
}

interface OrderResponse {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    currency: string;
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function sp(): { sessionId?: string } {
  return useAuthStore.getState().status ===
    'authenticated'
    ? {}
    : { sessionId: getSessionId() };
}

const EMPTY_ADDRESS: AddressFields = {
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
};

/* ------------------------------------------------------------------ */
/* Reusable input                                                     */
/* ------------------------------------------------------------------ */

function inputClass(error?: string) {
  return [
    'mt-2 w-full rounded-xl border bg-[var(--color-background-primary)]',
    'px-4 py-3 text-sm text-[var(--color-text-primary)]',
    'placeholder:text-[var(--color-text-tertiary)]',
    'transition-colors',
    'focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-[var(--color-border-focus)]',
    error
      ? 'border-red-500'
      : 'border-[var(--color-border-primary)]',
  ].join(' ');
}

/* ------------------------------------------------------------------ */
/* Address form                                                       */
/* ------------------------------------------------------------------ */

function AddressForm({
  value,
  onChange,
  errors,
}: {
  value: AddressFields;
  onChange: (v: AddressFields) => void;
  errors: Partial<Record<keyof AddressFields, string>>;
}) {
  const set = (
    key: keyof AddressFields,
    val: string,
  ) => {
    onChange({
      ...value,
      [key]: val,
    });
  };

  const field = (
    label: string,
    key: keyof AddressFields,
    opts?: {
      required?: boolean;
      half?: boolean;
      type?: string;
      placeholder?: string;
      autoComplete?: string;
    },
  ) => {
    const inputId = `checkout-${key}`;
    const errorId = errors[key]
      ? `${inputId}-error`
      : undefined;

    return (
      <div
        className={
          opts?.half
            ? 'min-w-0 flex-1'
            : ''
        }
      >
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold text-[var(--color-text-primary)]"
        >
          {label}{' '}
          {opts?.required && (
            <span
              className="text-red-500"
              aria-hidden="true"
            >
              *
            </span>
          )}
        </label>

        <input
          id={inputId}
          type={opts?.type ?? 'text'}
          value={value[key]}
          onChange={(e) =>
            set(key, e.target.value)
          }
          placeholder={opts?.placeholder}
          autoComplete={opts?.autoComplete}
          aria-required={
            opts?.required || undefined
          }
          aria-invalid={
            !!errors[key] || undefined
          }
          aria-describedby={errorId}
          className={inputClass(errors[key])}
        />

        {errors[key] && (
          <p
            id={errorId}
            role="alert"
            className="mt-1.5 text-xs text-red-500"
          >
            {errors[key]}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 sm:flex-row">
        {field('First name', 'firstName', {
          required: true,
          half: true,
          autoComplete: 'given-name',
        })}

        {field('Last name', 'lastName', {
          required: true,
          half: true,
          autoComplete: 'family-name',
        })}
      </div>

      {field(
        'Company',
        'company',
        {
          placeholder: 'Optional',
          autoComplete: 'organization',
        },
      )}

      {field(
        'Address line 1',
        'address1',
        {
          required: true,
          autoComplete: 'address-line1',
        },
      )}

      {field(
        'Address line 2',
        'address2',
        {
          placeholder: 'Apartment, suite, etc. (optional)',
          autoComplete: 'address-line2',
        },
      )}

      <div className="flex flex-col gap-5 sm:flex-row">
        {field('City', 'city', {
          required: true,
          half: true,
          autoComplete: 'address-level2',
        })}

        {field(
          'State / Province',
          'state',
          {
            required: true,
            half: true,
            autoComplete: 'address-level1',
          },
        )}
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        {field(
          'Postal code',
          'postalCode',
          {
            required: true,
            half: true,
            autoComplete: 'postal-code',
          },
        )}

        {field(
          'Country code',
          'country',
          {
            required: true,
            half: true,
            placeholder: 'IN',
            autoComplete: 'country',
          },
        )}
      </div>

      {field('Phone', 'phone', {
        required: true,
        type: 'tel',
        autoComplete: 'tel',
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main checkout                                                      */
/* ------------------------------------------------------------------ */

export function Checkout() {
  const navigate = useNavigate();

  const [email, setEmail] =
    useState('');
  const [address, setAddress] =
    useState<AddressFields>(
      EMPTY_ADDRESS,
    );
  const [addressErrors, setAddressErrors] =
    useState<
      Partial<
        Record<keyof AddressFields, string>
      >
    >({});
  const [
    selectedMethodId,
    setSelectedMethodId,
  ] = useState('');
  const [notes, setNotes] =
    useState('');
  const [submitError, setSubmitError] =
    useState<string | null>(null);
  const [emailError, setEmailError] =
    useState<string | null>(null);
  const [
    startingPayment,
    setStartingPayment,
  ] = useState(false);

  const authed = useAuthStore(
    (s) => s.status === 'authenticated',
  );

  const user = useAuthStore(
    (s) => s.user,
  );

  const { openCheckout } =
    useRazorpay();

  useSeo({
    title: 'Checkout | AUREVO',
    description:
      'Secure checkout at AUREVO — pay safely with Razorpay.',
    noindex: true,
  });

  /* -------------------------------------------------------------- */
  /* Prefill authenticated customer                                  */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    if (authed && user) {
      setEmail(
        (prev) =>
          prev ||
          user.email ||
          '',
      );

      setAddress((prev) => ({
        ...prev,
        firstName:
          prev.firstName ||
          user.firstName ||
          '',
        lastName:
          prev.lastName ||
          user.lastName ||
          '',
      }));
    }
  }, [authed, user]);

  /* -------------------------------------------------------------- */
  /* Shipping methods                                                 */
  /* -------------------------------------------------------------- */

  const methodsQuery = useQuery({
    queryKey: [
      'shipping',
      'methods',
    ],
    queryFn: () =>
      api
        .get<ShippingMethod[]>(
          '/shipping/methods',
        )
        .then((r) => r.data),
  });

  /* -------------------------------------------------------------- */
  /* Checkout preview                                                 */
  /* -------------------------------------------------------------- */

  const previewQuery = useQuery({
    queryKey: [
      'checkout',
      'preview',
      selectedMethodId,
    ],
    queryFn: () =>
      api
        .get<PreviewResponse>(
          '/checkout/preview',
          {
            params: {
              ...sp(),
              ...(selectedMethodId
                ? {
                    shippingMethodId:
                      selectedMethodId,
                  }
                : {}),
            },
          },
        )
        .then((r) => r.data),
  });

  const preview =
    previewQuery.data;

  /* -------------------------------------------------------------- */
  /* Auto-select first shipping method                               */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    if (
      methodsQuery.data &&
      methodsQuery.data.length > 0 &&
      !selectedMethodId
    ) {
      setSelectedMethodId(
        methodsQuery.data[0].id,
      );
    }
  }, [
    methodsQuery.data,
    selectedMethodId,
  ]);

  /* -------------------------------------------------------------- */
  /* Validation                                                       */
  /* -------------------------------------------------------------- */

  const validate = (): boolean => {
    let valid = true;

    if (!authed) {
      const val =
        email.trim();

      if (!val) {
        setEmailError(
          'Email is required for guest checkout',
        );
        valid = false;
      } else if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          val,
        )
      ) {
        setEmailError(
          'Enter a valid email address',
        );
        valid = false;
      } else {
        setEmailError(null);
      }
    } else {
      setEmailError(null);
    }

    const errs: Partial<
      Record<keyof AddressFields, string>
    > = {};

    if (!address.firstName.trim())
      errs.firstName = 'Required';

    if (!address.lastName.trim())
      errs.lastName = 'Required';

    if (!address.address1.trim())
      errs.address1 = 'Required';

    if (!address.city.trim())
      errs.city = 'Required';

    if (!address.state.trim())
      errs.state = 'Required';

    if (!address.postalCode.trim())
      errs.postalCode = 'Required';

    if (
      !address.country.trim() ||
      address.country.trim().length < 2
    ) {
      errs.country =
        'Enter a 2-letter country code';
    }

    if (!address.phone.trim())
      errs.phone = 'Required';

    setAddressErrors(errs);

    if (
      Object.keys(errs).length > 0
    ) {
      valid = false;
    }

    return valid;
  };

  /* -------------------------------------------------------------- */
  /* Create order                                                     */
  /* -------------------------------------------------------------- */

  const orderMutation =
    useMutation({
      mutationFn: () =>
        api.post<OrderResponse>(
          '/checkout',
          {
            email: email.trim(),

            shippingAddress: {
              firstName:
                address.firstName.trim(),
              lastName:
                address.lastName.trim(),
              company:
                address.company.trim() ||
                undefined,
              address1:
                address.address1.trim(),
              address2:
                address.address2.trim() ||
                undefined,
              city:
                address.city.trim(),
              state:
                address.state.trim(),
              postalCode:
                address.postalCode.trim(),
              country:
                address.country
                  .trim()
                  .toUpperCase(),
              phone:
                address.phone.trim(),
            },

            shippingMethodId:
              selectedMethodId ||
              undefined,

            notes:
              notes.trim() ||
              undefined,
          },
          {
            params: sp(),
          },
        ),

      onError: (err: any) => {
        setSubmitError(
          err?.message ??
            'Failed to place order. Please try again.',
        );
      },
    });

  /* -------------------------------------------------------------- */
  /* Confirmation                                                     */
  /* -------------------------------------------------------------- */

  const goToConfirmation =
    useCallback(
      (
        order: OrderResponse['order'],
        paid: boolean,
      ) => {
        void navigate(
          `/order-confirmation?orderNumber=${order.orderNumber}${
            paid ? '&paid=1' : ''
          }`,
          {
            replace: true,
          },
        );
      },
      [navigate],
    );

  /* -------------------------------------------------------------- */
  /* Razorpay                                                         */
  /* -------------------------------------------------------------- */

  const startPayment =
    useCallback(
      async (
        order: OrderResponse['order'],
      ) => {
        setStartingPayment(true);

        try {
          await openCheckout({
            orderId: order.id,
            amount: order.total,
            currency: order.currency,
            orderNumber:
              order.orderNumber,
            sessionId: authed
              ? undefined
              : getSessionId(),
            name: `${address.firstName} ${address.lastName}`.trim(),
            email: email.trim(),
            phone: address.phone,

            onSuccess: () =>
              goToConfirmation(
                order,
                true,
              ),

            onCancel: () =>
              goToConfirmation(
                order,
                false,
              ),
          });
        } catch {
          goToConfirmation(
            order,
            false,
          );
        }
      },
      [
        authed,
        address,
        email,
        openCheckout,
        goToConfirmation,
      ],
    );

  const handleSubmit =
    () => {
      setSubmitError(null);

      if (!validate())
        return;

      orderMutation.mutate(
        undefined,
        {
          onSuccess: ({
            data,
          }) =>
            void startPayment(
              data.order,
            ),
        },
      );
    };

  /* -------------------------------------------------------------- */
  /* Loading                                                         */
  /* -------------------------------------------------------------- */

  if (
    previewQuery.isLoading ||
    methodsQuery.isLoading
  ) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-10 w-52" />

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Skeleton className="h-[620px] w-full rounded-3xl" />
          <Skeleton className="h-[480px] w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------- */
  /* Empty cart                                                       */
  /* -------------------------------------------------------------- */

  if (
    preview &&
    preview.items.length === 0
  ) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 sm:py-28">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-interactive-primary)]">
          Checkout
        </p>

        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)]">
          Your cart is empty.
        </h1>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--color-text-secondary)]">
          Add something to your AUREVO
          cart before continuing to
          checkout.
        </p>

        <Button
          className="mt-7"
          onClick={() =>
            navigate('/products')
          }
        >
          Browse products →
        </Button>
      </div>
    );
  }

  /* -------------------------------------------------------------- */
  /* Main checkout                                                    */
  /* -------------------------------------------------------------- */

  return (
    <div className="bg-[var(--color-background-primary)]">
      {/* Page heading */}
      <section className="border-b border-[var(--color-border)]">
        <div className="mx-auto max-w-7xl px-4 py-9 sm:px-6 sm:py-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-interactive-primary)]">
                Secure checkout
              </p>

              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-4xl">
                Complete your order
              </h1>

              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
                Review your details, choose
                delivery, and continue to secure
                payment.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-background-secondary)]">
                ✓
              </span>
              Secure payment
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        {previewQuery.error && (
          <Alert
            variant="error"
            className="mb-6"
          >
            {previewQuery.error instanceof Error
              ? previewQuery.error.message
              : 'Could not load cart'}
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
          {/* ====================================================== */}
          {/* LEFT                                                      */}
          {/* ====================================================== */}

          <div className="space-y-6">
            {/* Guest email */}
            {!authed && (
              <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-7">
                <div className="mb-6">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                    Step 01
                  </p>

                  <h2 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
                    Contact information
                  </h2>

                  <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                    We'll send your order
                    confirmation here.
                  </p>
                </div>

                <label
                  htmlFor="checkout-email"
                  className="block text-xs font-semibold text-[var(--color-text-primary)]"
                >
                  Email address{' '}
                  <span
                    className="text-red-500"
                    aria-hidden="true"
                  >
                    *
                  </span>
                </label>

                <input
                  id="checkout-email"
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                  aria-required="true"
                  aria-invalid={
                    !!emailError ||
                    undefined
                  }
                  aria-describedby={
                    emailError
                      ? 'checkout-email-error'
                      : undefined
                  }
                  className={inputClass(
                    emailError ??
                      undefined,
                  )}
                />

                {emailError && (
                  <p
                    id="checkout-email-error"
                    role="alert"
                    className="mt-1.5 text-xs text-red-500"
                  >
                    {emailError}
                  </p>
                )}
              </section>
            )}

            {/* Shipping address */}
            <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-7">
              <div className="mb-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                  {authed
                    ? 'Step 01'
                    : 'Step 02'}
                </p>

                <h2 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
                  Shipping address
                </h2>

                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
                  Where should we deliver
                  your order?
                </p>
              </div>

              <AddressForm
                value={address}
                onChange={setAddress}
                errors={addressErrors}
              />
            </section>

            {/* Shipping method */}
            <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-7">
              <div className="mb-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                  {authed
                    ? 'Step 02'
                    : 'Step 03'}
                </p>

                <h2 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
                  Delivery method
                </h2>
              </div>

              {methodsQuery.error && (
                <Alert
                  variant="error"
                  className="mb-4"
                >
                  Could not load shipping
                  methods
                </Alert>
              )}

              <div className="space-y-3">
                {methodsQuery.data?.map(
                  (method) => {
                    const isSelected =
                      method.id ===
                      selectedMethodId;

                    const isFree =
                      !!method.freeShippingThreshold &&
                      (preview?.subtotal ??
                        0) >=
                        method.freeShippingThreshold;

                    return (
                      <label
                        key={method.id}
                        className={`flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition-all ${
                          isSelected
                            ? 'border-[var(--color-interactive-primary)] bg-[var(--color-interactive-primary)]/5 shadow-sm'
                            : 'border-[var(--color-border-primary)] hover:border-[var(--color-text-tertiary)]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="shipping-method"
                          value={method.id}
                          checked={
                            isSelected
                          }
                          onChange={() =>
                            setSelectedMethodId(
                              method.id,
                            )
                          }
                          className="h-4 w-4 accent-[var(--color-interactive-primary)]"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {method.name}
                          </div>

                          <div className="mt-1 text-xs leading-5 text-[var(--color-text-tertiary)]">
                            {method.estimatedDays}{' '}
                            business day
                            {method.estimatedDays ===
                            1
                              ? ''
                              : 's'}

                            {method.description
                              ? ` · ${method.description}`
                              : ''}
                          </div>
                        </div>

                        <span className="shrink-0 text-sm font-semibold text-[var(--color-text-primary)]">
                          {isFree
                            ? 'Free'
                            : formatMoney(
                                method.baseCost,
                              )}
                        </span>
                      </label>
                    );
                  },
                )}

                {methodsQuery.data &&
                  methodsQuery.data.length ===
                    0 && (
                    <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-5 text-sm text-[var(--color-text-tertiary)]">
                      No shipping methods
                      are available for
                      your location.
                    </p>
                  )}
              </div>
            </section>

            {/* Notes */}
            <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-5 sm:p-7">
              <div className="mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
                  Optional
                </p>

                <h2 className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
                  Order notes
                </h2>
              </div>

              <label
                htmlFor="checkout-notes"
                className="block text-xs font-semibold text-[var(--color-text-primary)]"
              >
                Delivery instructions
              </label>

              <textarea
                id="checkout-notes"
                value={notes}
                onChange={(e) =>
                  setNotes(e.target.value)
                }
                rows={4}
                placeholder="Anything our delivery team should know?"
                className="mt-2 w-full resize-none rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-background-primary)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]"
              />
            </section>
          </div>

          {/* ====================================================== */}
          {/* RIGHT                                                     */}
          {/* ====================================================== */}

          <aside>
            <div className="lg:sticky lg:top-24">
              <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
                <div className="border-b border-[var(--color-border)] p-6 sm:p-7">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">
                    Your order
                  </p>

                  <h2 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
                    Order summary
                  </h2>
                </div>

                {/* Items */}
                <div className="p-6 sm:p-7">
                  <ul className="space-y-4">
                    {preview?.items.map(
                      (item) => (
                        <li
                          key={`${item.productId}-${item.variantId}`}
                          className="flex gap-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-background-primary)] text-xs font-semibold text-[var(--color-text-secondary)]">
                            {item.quantity}×
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-medium leading-5 text-[var(--color-text-primary)]">
                              {item.productName}
                            </p>

                            {item.variantName && (
                              <p className="mt-0.5 truncate text-[10px] text-[var(--color-text-tertiary)]">
                                {item.variantName}
                              </p>
                            )}
                          </div>

                          <span className="shrink-0 text-xs font-semibold text-[var(--color-text-primary)]">
                            {formatMoney(
                              item.totalPrice,
                            )}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>

                  {/* Totals */}
                  <dl className="mt-6 space-y-3 border-t border-[var(--color-border)] pt-5 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--color-text-secondary)]">
                        Subtotal
                      </dt>

                      <dd className="font-medium text-[var(--color-text-primary)]">
                        {formatMoney(
                          preview?.subtotal ??
                            0,
                        )}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--color-text-secondary)]">
                        Shipping
                      </dt>

                      <dd className="font-medium text-[var(--color-text-primary)]">
                        {(preview?.shippingCost ??
                          0) === 0
                          ? preview?.shippingMethod
                            ? 'Free'
                            : '—'
                          : formatMoney(
                              preview?.shippingCost ??
                                0,
                            )}
                      </dd>
                    </div>

                    <div className="flex justify-between gap-4">
                      <dt className="text-[var(--color-text-secondary)]">
                        Tax (18% GST)
                      </dt>

                      <dd className="font-medium text-[var(--color-text-primary)]">
                        {formatMoney(
                          preview?.tax ??
                            0,
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="my-5 border-t border-[var(--color-border)]" />

                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        Total
                      </p>

                      <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                        {preview?.currency ??
                          'INR'}
                      </p>
                    </div>

                    <p className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)]">
                      {formatMoney(
                        preview?.total ??
                          0,
                      )}
                    </p>
                  </div>

                  {/* Error */}
                  {submitError && (
                    <Alert
                      variant="error"
                      className="mt-5"
                    >
                      {submitError}
                    </Alert>
                  )}

                  {/* Payment CTA */}
                  <Button
                    className="mt-6 h-12 w-full rounded-full"
                    onClick={handleSubmit}
                    disabled={
                      orderMutation.isPending ||
                      startingPayment ||
                      !preview ||
                      preview.items.length ===
                        0
                    }
                  >
                    {orderMutation.isPending
                        ? 'Placing order…'
                        : startingPayment
                          ? 'Preparing payment…'
                          : 'Place order →'}
                  </Button>

                  <div className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-[var(--color-text-tertiary)]">
                    <span
                      className="mt-0.5"
                      aria-hidden="true"
                    >
                      🔒
                    </span>

                    <span>
                      Your order is created first,
                      then payment is securely
                      collected through Razorpay.
                    </span>
                  </div>
                </div>
              </div>

              {/* Trust strip */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4">
                  <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                    Secure payment
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-[var(--color-text-tertiary)]">
                    Protected checkout
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-4">
                  <p className="text-xs font-semibold text-[var(--color-text-primary)]">
                    Order tracking
                  </p>

                  <p className="mt-1 text-[10px] leading-4 text-[var(--color-text-tertiary)]">
                    Confirmation after payment
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
