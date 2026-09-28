import { Link } from 'react-router-dom';
import { canonicalFor, useSeo } from '../../hooks/useSeo';

const principles = [
  {
    number: '01',
    title: 'Useful over excessive',
    copy: 'We organise practical accessories for everyday routines, work, travel, home and hobbies so the store stays easy to explore.',
  },
  {
    number: '02',
    title: 'Clear before checkout',
    copy: 'Product details, the GST-inclusive price, delivery choices and the complete order total are shown before payment.',
  },
  {
    number: '03',
    title: 'Support after purchase',
    copy: 'Orders remain visible from your account, with a direct support route for delivery, return or product questions.',
  },
];

export function About() {
  useSeo({
    title: 'About AUREVO',
    description: 'Learn how AUREVO selects useful everyday products, presents clear order information and supports customers after purchase.',
    canonical: canonicalFor('/about'),
  });

  return (
    <main className="bg-[var(--color-background-primary)]">
      <section className="border-b border-[var(--color-border)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-interactive-primary)]">
              About AUREVO
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-[-0.045em] text-[var(--color-text-primary)] sm:text-6xl">
              Thoughtful finds for the way everyday life works.
            </h1>
          </div>
          <p className="max-w-xl text-base leading-8 text-[var(--color-text-secondary)]">
            AUREVO is an online store that brings together practical products from independent suppliers and presents them in a calmer, clearer shopping experience. We focus on useful details, transparent totals and straightforward support.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="grid gap-5 md:grid-cols-3">
          {principles.map((principle) => (
            <article key={principle.number} className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-background-secondary)] p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-[0.2em] text-[var(--color-interactive-primary)]">{principle.number}</p>
              <h2 className="mt-8 text-xl font-semibold tracking-[-0.025em] text-[var(--color-text-primary)]">{principle.title}</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">{principle.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-[var(--color-border)] bg-[var(--color-background-secondary)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-interactive-primary)]">How it works</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-4xl">A clear path from discovery to delivery.</h2>
          </div>
          <ol className="space-y-7">
            <li className="border-b border-[var(--color-border)] pb-7">
              <p className="font-semibold text-[var(--color-text-primary)]">Explore and compare</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">Use categories, search, product images and specifications to decide whether an item fits your needs.</p>
            </li>
            <li className="border-b border-[var(--color-border)] pb-7">
              <p className="font-semibold text-[var(--color-text-primary)]">Review the complete order</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">Checkout shows the GST-inclusive product price, available shipping method and final payable amount before you continue.</p>
            </li>
            <li>
              <p className="font-semibold text-[var(--color-text-primary)]">Pay securely and follow progress</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-text-secondary)]">Razorpay handles payment details. Your AUREVO account keeps order status and support within reach.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-interactive-primary)]">Ready when you are</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-4xl">Find something useful for today.</h2>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/products" className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--color-interactive-primary)] px-7 text-sm font-semibold text-white transition-opacity hover:opacity-90">Browse the collection</Link>
          <Link to="/contact" className="inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--color-border)] px-7 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-background-hover)]">Contact support</Link>
        </div>
      </section>
    </main>
  );
}
