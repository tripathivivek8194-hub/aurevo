import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Skeleton } from "@aurevo/design-system";
import { api } from "../../lib/api";
import { useSeo, canonicalFor, jsonLd } from "../../hooks/useSeo";
import { ProductCard } from "../../components/store/ProductCard";
import {
  displayPrice,
  primaryImage,
  type CategorySummary,
  type ProductSummary,
  type ProductList,
  type ReviewSummary,
} from "../../lib/storefront";
import { formatMoney } from "../../lib/format";
import { readRecentlyViewed } from "../../lib/recentlyViewed";
import "../../styles/home.css";

function ProductImage({
  product,
  eager = false,
}: {
  product: ProductSummary;
  eager?: boolean;
}) {
  const src = primaryImage(product);
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img
      src={src}
      alt={product.name}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="home-image-fallback">AUREVO</span>
  );
}

function Collection({
  title,
  eyebrow,
  products,
  loading,
  failed,
  retry,
}: {
  title: string;
  eyebrow: string;
  products: ProductSummary[];
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  return (
    <section className="home-section" aria-label={title}>
      <div className="home-section-heading">
        <div>
          <p className="home-eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <Link className="home-text-link" to="/products">
          Shop all <span aria-hidden="true">↗</span>
        </Link>
      </div>
      {loading ? (
        <div
          className="home-product-grid"
          aria-label="Loading products"
          aria-busy="true"
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full" />
          ))}
        </div>
      ) : failed ? (
        <div className="home-empty" role="status">
          <p>We couldn’t load this collection.</p>
          <button type="button" className="home-text-link" onClick={retry}>
            Try again
          </button>
        </div>
      ) : products.length ? (
        <div className="home-product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="home-empty">
          <p>More finds are on their way.</p>
          <Link className="home-text-link" to="/products">
            Explore the collection ↗
          </Link>
        </div>
      )}
    </section>
  );
}

export function Home() {
  const [recentlyViewed] = useState(readRecentlyViewed);
  const featured = useQuery({
    queryKey: ["store", "featured"],
    queryFn: () =>
      api
        .get<ProductSummary[]>("/products/featured", { params: { limit: 4 } })
        .then((r) => r.data),
    staleTime: 300000,
  });
  const categories = useQuery({
    queryKey: ["store", "categories"],
    queryFn: () =>
      api.get<CategorySummary[]>("/categories").then((r) => r.data),
    staleTime: 300000,
  });
  const latest = useQuery({
    queryKey: ["store", "home-latest"],
    queryFn: () =>
      api
        .get<ProductList>("/products", {
          params: {
            status: "ACTIVE",
            limit: 8,
            sortBy: "createdAt",
            sortOrder: "desc",
          },
        })
        .then((r) => r.data),
    staleTime: 300000,
  });
  const picks = featured.data ?? [];
  const arrivals = (latest.data?.data ?? [])
    .filter((p) => !picks.some((pick) => pick.id === p.id))
    .slice(0, 4);
  const hero =
    picks.find((p) => primaryImage(p)) ??
    latest.data?.data.find((p) => primaryImage(p));
  // The public detail endpoint returns approved reviews only. Never synthesize ratings or testimonials.
  const reviewProduct = useQuery({
    queryKey: ["store", "home-reviews", hero?.slug],
    queryFn: () =>
      api
        .get<ProductSummary & { reviews?: ReviewSummary[] }>(
          "/products/" + hero!.slug,
        )
        .then((r) => r.data),
    enabled: !!hero?.slug,
    staleTime: 300000,
  });
  const reviews = (reviewProduct.data?.reviews ?? [])
    .filter((r) => (r.content ?? r.comment)?.trim())
    .slice(0, 3);
  const origin = canonicalFor("");
  useSeo({
    title: "AUREVO | Finds for your everyday",
    description:
      "Explore accessories and useful everyday finds at AUREVO. Discover the collection, compare product details and check out with Razorpay.",
    canonical: origin,
  });
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "AUREVO",
        ...(origin
          ? { "@id": origin, url: origin, logo: origin + "favicon.svg" }
          : {}),
      },
      {
        "@type": "WebSite",
        name: "AUREVO",
        alternateName: ["AUREVO Store", "aurevo.buzz"],
        ...(origin
          ? {
              url: origin,
              potentialAction: {
                "@type": "SearchAction",
                target: origin + "products?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            }
          : {}),
      },
    ],
  };
  return (
    <div className="aurevo-home">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-eyebrow">THE EVERYDAY, CONSIDERED</p>
          <h1>
            Little finds.
            <br />
            <em>Better everyday.</em>
          </h1>
          <p className="home-intro">
            Useful accessories. Thoughtful additions. Discover the details that
            make your day feel more like you.
          </p>
          <div className="home-hero-actions">
            <Link className="home-button" to="/products">
              Explore the collection <span aria-hidden="true">↗</span>
            </Link>
            <a className="home-text-link" href="#categories">
              Find your category ↓
            </a>
          </div>
          <p className="home-hero-note">
            Explore at your pace. Choose what works for you.
          </p>
        </div>
        <div className="home-hero-visual">
          <span className="home-visual-label">THE AUREVO EDIT</span>
          {hero ? (
            <Link className="home-hero-product" to={"/products/" + hero.slug}>
              <div className="home-hero-image">
                <ProductImage product={hero} eager />
              </div>
              <div className="home-hero-caption">
                <div>
                  <span className="home-eyebrow">IN THE COLLECTION</span>
                  <h2>{hero.name}</h2>
                  <span>{formatMoney(displayPrice(hero))}</span>
                </div>
                <span className="home-round-arrow" aria-hidden="true">
                  ↗
                </span>
              </div>
            </Link>
          ) : (
            <div className="home-hero-placeholder">
              <span>A</span>
              <p>
                A little discovery.
                <br />
                An everyday difference.
              </p>
            </div>
          )}
          <span className="home-visual-footnote">
            FIND SOMETHING THAT FITS YOUR DAY
          </span>
        </div>
      </section>
      <div className="home-service-strip">
        <p>
          <span aria-hidden="true">↗</span> Everyday discoveries
        </p>
        <p>
          <span aria-hidden="true">◇</span> Payments with Razorpay
        </p>
        <p>
          <span aria-hidden="true">＋</span> Details before you decide
        </p>
      </div>
      <section
        className="home-section"
        id="categories"
        aria-labelledby="categories-title"
      >
        <div className="home-section-heading">
          <div>
            <p className="home-eyebrow">START SOMEWHERE GOOD</p>
            <h2 id="categories-title">Find your kind of useful.</h2>
          </div>
        </div>
        {categories.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : categories.isError ? (
          <div className="home-empty" role="status">
            Categories are taking a little longer.{" "}
            <button
              className="home-text-link"
              onClick={() => void categories.refetch()}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="home-category-grid">
            {categories.data?.map((category, index) => {
              const sample = latest.data?.data.find(
                (p) => p.categoryId === category.id && primaryImage(p),
              );
              const categoryImage = sample
                ? primaryImage(sample)
                : category.image;
              return (
                <Link
                  className="home-category"
                  key={category.id}
                  to={"/products?category=" + encodeURIComponent(category.slug)}
                >
                  <div>
                    <span className="home-eyebrow">
                      {String(index + 1).padStart(2, "0")} / EXPLORE
                    </span>
                    <h3>{category.name}</h3>
                    <span className="home-text-link">Shop the category ↗</span>
                  </div>
                  {categoryImage && (
                    <div className="home-category-image">
                      {sample ? (
                        <ProductImage product={sample} />
                      ) : (
                        <img
                          src={categoryImage}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                    </div>
                  )}
                </Link>
              );
            })}
            <Link className="home-category home-category-all" to="/products">
              <div>
                <span className="home-eyebrow">ROOM FOR DISCOVERY</span>
                <h3>The full collection</h3>
                <span className="home-text-link">See every find ↗</span>
              </div>
              <span className="home-category-symbol" aria-hidden="true">
                ↗
              </span>
            </Link>
          </div>
        )}
      </section>
      <div id="featured" className="home-featured">
        <Collection
          title="In the spotlight."
          eyebrow="FEATURED AT AUREVO"
          products={picks}
          loading={featured.isLoading}
          failed={featured.isError}
          retry={() => void featured.refetch()}
        />
      </div>
      {recentlyViewed.length > 0 && (
        <Collection
          title="Pick up where you left off."
          eyebrow="RECENTLY VIEWED"
          products={recentlyViewed}
          loading={false}
          failed={false}
          retry={() => undefined}
        />
      )}
      <section id="why-aurevo" className="home-why">
        <div>
          <p className="home-eyebrow">WHY AUREVO</p>
          <h2>
            Good finds.
            <br />
            <em>A simpler way to shop.</em>
          </h2>
          <p>
            Less guesswork, more discovery. Explore the details, choose your
            options and make it yours.
          </p>
          <Link className="home-text-link" to="/products">
            Meet the collection ↗
          </Link>
        </div>
        <div className="home-benefits">
          <article>
            <span>01</span>
            <div>
              <h3>Know what you’re choosing</h3>
              <p>
                Product images, specifications and available options, together
                in one place.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>A familiar way to pay</h3>
              <p>
                Continue to Razorpay for payment after reviewing your order at
                checkout.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Your order, within reach</h3>
              <p>
                Sign in to see your order history and check the status of your
                purchases.
              </p>
              <Link className="home-text-link" to="/account/orders">
                View your orders ↗
              </Link>
            </div>
          </article>
        </div>
      </section>
      <Collection
        title="More to discover."
        eyebrow="LATEST ADDITIONS"
        products={arrivals}
        loading={latest.isLoading}
        failed={latest.isError}
        retry={() => void latest.refetch()}
      />
      <section className="home-community" aria-labelledby="community-title">
        <div>
          <p className="home-eyebrow">THE AUREVO COMMUNITY</p>
          <h2 id="community-title">Your experience matters.</h2>
          <p>
            Found something that fits your everyday? Share your experience on
            its product page to help the next person choose.
          </p>
          <Link
            className="home-text-link"
            to={hero ? "/products/" + hero.slug : "/products"}
          >
            {reviews.length
              ? "Read product reviews"
              : "Explore products & share a review"}{" "}
            ↗
          </Link>
        </div>
        {reviews.length > 0 && (
          <div className="home-reviews">
            {reviews.map((review) => (
              <figure key={review.id}>
                <span aria-label={review.rating + " out of 5 stars"}>
                  {"★".repeat(Math.max(0, Math.min(5, review.rating)))}
                </span>
                <blockquote>{review.content ?? review.comment}</blockquote>
                <figcaption>
                  {review.user?.firstName || "Customer"} ·{" "}
                  <Link to={"/products/" + hero!.slug}>{hero!.name}</Link>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
