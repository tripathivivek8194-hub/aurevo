import { Link, useParams } from 'react-router-dom';
import { canonicalFor, useSeo } from '../../hooks/useSeo';

type InfoSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type InfoPage = {
  eyebrow: string;
  title: string;
  intro: string;
  sections: InfoSection[];
};

const pages: Record<string, InfoPage> = {
  shipping: {
    eyebrow: 'Order help',
    title: 'Shipping information',
    intro: 'Clear delivery details before you place an order, with the final method and cost shown at checkout.',
    sections: [
      {
        title: 'Where we deliver',
        paragraphs: ['AUREVO currently serves addresses in India where our delivery partners can provide service. Availability is checked again during checkout.'],
      },
      {
        title: 'Delivery estimates',
        paragraphs: ['The product page shows the available shipping method and its current estimate. The checkout page confirms the method, estimated time and any shipping charge for your order.'],
        bullets: ['Delivery estimates are measured in days and begin after the order is accepted.', 'Remote locations, public holidays and carrier disruptions can extend an estimate.', 'Enter a complete address and reachable phone number to reduce avoidable delays.'],
      },
      {
        title: 'Following your order',
        paragraphs: ['Signed-in customers can open My Orders to check order status and review delivery details. Keep your order confirmation until delivery is complete.'],
      },
    ],
  },
  returns: {
    eyebrow: 'Order help',
    title: 'Returns and refunds',
    intro: 'If an order arrives damaged, defective, or different from what you ordered, we want to review the issue fairly.',
    sections: [
      {
        title: 'Start with your order',
        paragraphs: ['Open My Orders, select the affected order and keep the item, packaging and confirmation details available. Report the problem promptly and include clear photos when they help explain it.'],
      },
      {
        title: 'How a request is reviewed',
        paragraphs: ['Eligibility depends on the item, its condition and the reason for the request. Do not send an item back until return instructions have been provided.'],
        bullets: ['Damaged, defective and incorrect items can be reviewed.', 'Items should remain in their received condition unless inspection is necessary to identify a fault.', 'A change-of-mind request may not be available for every product.'],
      },
      {
        title: 'Approved refunds',
        paragraphs: ['When a refund is approved, it is sent back through the original payment method. Your bank or payment provider may take additional time to display the credit.'],
      },
    ],
  },
  privacy: {
    eyebrow: 'Your information',
    title: 'Privacy notice',
    intro: 'This notice explains the information AUREVO uses to run the store and fulfil customer orders.',
    sections: [
      {
        title: 'Information used by the store',
        paragraphs: ['We use the details you provide when creating an account, placing an order or requesting support. This can include your name, email address, phone number, delivery address and order history.'],
      },
      {
        title: 'Why it is used',
        bullets: ['To provide accounts, carts, checkout and order updates.', 'To deliver purchases and respond to order issues.', 'To protect the store, customers and payment flow from misuse.', 'To maintain and improve store reliability.'],
        paragraphs: [],
      },
      {
        title: 'Store usage measurement',
        paragraphs: ['AUREVO uses first-party measurement to understand broad steps such as store sessions, product views, additions to cart and checkout starts. It stores an opaque browser identifier, the page path, a broad traffic-source category and, where relevant, a product identifier. This measurement does not store your name, email, delivery address or payment details, and it is not sent to an advertising network.'],
      },
      {
        title: 'Payments and service providers',
        paragraphs: ['Payments are completed through Razorpay. Payment details entered in the Razorpay checkout are handled by the payment provider. Delivery and technical service providers receive only the information needed to perform their part of the service.'],
      },
      {
        title: 'Your choices',
        paragraphs: ['You can review and update available account information after signing in. For questions about an order or the information connected to it, begin from the relevant order in My Orders.'],
      },
    ],
  },
  terms: {
    eyebrow: 'Store terms',
    title: 'Terms of use',
    intro: 'These terms describe the basic rules for using AUREVO and placing an order through the store.',
    sections: [
      {
        title: 'Using AUREVO',
        paragraphs: ['Use the store lawfully and provide accurate account, contact and delivery information. Do not interfere with the site, attempt unauthorized access or misuse another person’s account.'],
      },
      {
        title: 'Products, prices and orders',
        paragraphs: ['Product availability, prices and delivery options can change. The checkout review shows the current order total before payment. An order may be cancelled and refunded if an item cannot be supplied, payment cannot be verified or the order appears fraudulent.'],
      },
      {
        title: 'Product information',
        paragraphs: ['We work to present useful images, specifications and options. Screen settings and supplier updates can cause small differences, so review the full product page and selected option before ordering.'],
      },
      {
        title: 'Orders and support',
        paragraphs: ['Your order confirmation and account order page are the main references for a purchase. Shipping, return and refund information on this site forms part of these terms.'],
      },
    ],
  },
};

export function StoreInfo() {
  const { page = '' } = useParams();
  const content = pages[page] ?? pages.shipping;

  useSeo({
    title: content.title,
    description: content.intro,
    canonical: canonicalFor(`/help/${page}`),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pb-24 sm:pt-14">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-20">
        <header className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-interactive-primary)]">
            {content.eyebrow}
          </p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-[var(--color-text-primary)] sm:text-5xl">
            {content.title}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[var(--color-text-secondary)]">
            {content.intro}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/account/orders"
              className="rounded-full bg-[var(--color-interactive-primary)] px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              View my orders
            </Link>
            <Link
              to="/products"
              className="rounded-full border border-[var(--color-border)] px-5 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-background-hover)]"
            >
              Browse products
            </Link>
          </div>
        </header>

        <div className="overflow-hidden rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-background-secondary)]">
          {content.sections.map((section, index) => (
            <section
              key={section.title}
              className={`p-6 sm:p-8 ${index > 0 ? 'border-t border-[var(--color-border)]' : ''}`}
            >
              <div className="flex gap-5">
                <span className="pt-1 text-xs font-semibold text-[var(--color-text-tertiary)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">
                    {section.title}
                  </h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="mt-4 text-sm leading-7 text-[var(--color-text-secondary)]">
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets && (
                    <ul className="mt-5 space-y-3">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex gap-3 text-sm leading-6 text-[var(--color-text-secondary)]">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-interactive-primary)]" aria-hidden="true" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
