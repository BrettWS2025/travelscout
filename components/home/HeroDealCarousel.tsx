"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

export type OperatorDealCard = {
  id: string;
  title: string;
  locationName: string;
  imageUrl: string;
  originalPrice: number;
  dealPrice: number;
  currency: string;
  /** ISO datetime — when the deal / departure is available */
  departureAt: string;
};

/** Placeholder operator deals until live marketplace data is wired in. */
export const PLACEHOLDER_OPERATOR_DEALS: OperatorDealCard[] = [
  {
    id: "op-1",
    title: "Alpine lake kayak",
    locationName: "Wānaka",
    imageUrl: "/wanakatree.jpg",
    originalPrice: 129,
    dealPrice: 89,
    currency: "NZD",
    departureAt: "2026-09-16T09:30:00+12:00",
  },
  {
    id: "op-2",
    title: "Island hop sailing",
    locationName: "Bay of Islands",
    imageUrl: "/BayOfislands.jpg",
    originalPrice: 210,
    dealPrice: 149,
    currency: "NZD",
    departureAt: "2026-09-17T14:00:00+12:00",
  },
  {
    id: "op-3",
    title: "Harbour sunset cruise",
    locationName: "Auckland",
    imageUrl: "/Main_Page_Pic.jpg",
    originalPrice: 95,
    dealPrice: 69,
    currency: "NZD",
    departureAt: "2026-09-18T17:45:00+12:00",
  },
  {
    id: "op-4",
    title: "Festival weekend pass",
    locationName: "Wellington",
    imageUrl: "/jazzfestival.jpg",
    originalPrice: 180,
    dealPrice: 120,
    currency: "NZD",
    departureAt: "2026-09-19T19:00:00+12:00",
  },
  {
    id: "op-5",
    title: "Stadium match day",
    locationName: "Auckland",
    imageUrl: "/superrugbysuperround.jpg",
    originalPrice: 160,
    dealPrice: 110,
    currency: "NZD",
    departureAt: "2026-09-20T15:30:00+12:00",
  },
  {
    id: "op-6",
    title: "Coastal day escape",
    locationName: "Northland",
    imageUrl: "/BayOfislands.jpg",
    originalPrice: 145,
    dealPrice: 99,
    currency: "NZD",
    departureAt: "2026-09-21T10:00:00+12:00",
  },
];

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount}`;
  }
}

function formatAvailability(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time TBC";

  const day = new Intl.DateTimeFormat("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Pacific/Auckland",
  }).format(date);

  const time = new Intl.DateTimeFormat("en-NZ", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Pacific/Auckland",
  }).format(date);

  return `${day} · ${time}`;
}

function DealCard({ deal }: { deal: OperatorDealCard }) {
  const discount = Math.max(0, deal.originalPrice - deal.dealPrice);
  const discountPct =
    deal.originalPrice > 0
      ? Math.round((discount / deal.originalPrice) * 100)
      : 0;

  return (
    <article
      className="group flex w-[min(78vw,280px)] shrink-0 flex-col overflow-hidden rounded-2xl border border-[var(--ts-ink)]/10 bg-white shadow-[0_20px_50px_rgba(16,36,28,0.18)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_rgba(16,36,28,0.22)] md:w-[300px]"
      aria-label={`${deal.title} deal in ${deal.locationName}`}
    >
      <div className="relative aspect-[16/11] overflow-hidden bg-[var(--ts-mist)]">
        <Image
          src={deal.imageUrl}
          alt={deal.title}
          fill
          className="object-cover transition duration-700 group-hover:scale-[1.04]"
          sizes="(max-width: 768px) 78vw, 300px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--ts-ink)]/55 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-md bg-[var(--ts-lime)] px-2 py-1 font-[family-name:var(--font-sora)] text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--ts-ink)]">
          Save {formatMoney(discount, deal.currency)}
          {discountPct > 0 ? ` · ${discountPct}%` : ""}
        </span>
        <p className="absolute bottom-3 left-3 right-3 font-[family-name:var(--font-sora)] text-xs font-medium text-white/90">
          {deal.locationName}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="font-[family-name:var(--font-instrument)] text-xl leading-tight text-[var(--ts-ink)] md:text-[1.35rem]">
          {deal.title}
        </h3>

        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)] line-through">
            {formatMoney(deal.originalPrice, deal.currency)}
          </span>
          <span className="font-[family-name:var(--font-sora)] text-2xl font-semibold tracking-tight text-[var(--ts-teal)]">
            {formatMoney(deal.dealPrice, deal.currency)}
          </span>
        </div>

        <p className="mt-auto flex items-center gap-1.5 font-[family-name:var(--font-sora)] text-xs font-medium text-[var(--ts-ink)]/75">
          <Clock className="h-3.5 w-3.5 shrink-0 text-[var(--ts-teal)]" aria-hidden />
          <span>{formatAvailability(deal.departureAt)}</span>
        </p>
      </div>
    </article>
  );
}

type Props = {
  deals?: OperatorDealCard[];
};

/** Three copies so we can loop scroll without hitting an edge. */
const LOOP_COPIES = 3;

export function HeroDealCarousel({
  deals = PLACEHOLDER_OPERATOR_DEALS,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const loopingRef = useRef(false);
  const reduceMotionRef = useRef(false);

  const getSetWidth = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return 0;
    // One logical set is 1/LOOP_COPIES of the full scroll width.
    return el.scrollWidth / LOOP_COPIES;
  }, []);

  const normalizeLoop = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || loopingRef.current) return;
    const setWidth = getSetWidth();
    if (setWidth <= 0) return;

    if (el.scrollLeft < setWidth * 0.5) {
      loopingRef.current = true;
      el.scrollLeft += setWidth;
      loopingRef.current = false;
    } else if (el.scrollLeft >= setWidth * 1.5) {
      loopingRef.current = true;
      el.scrollLeft -= setWidth;
      loopingRef.current = false;
    }
  }, [getSetWidth]);

  const scrollByCard = useCallback(
    (direction: -1 | 1) => {
      const el = scrollerRef.current;
      if (!el) return;
      const card = el.querySelector<HTMLElement>("[data-deal-card]");
      const step = (card?.offsetWidth ?? 280) + 16;
      el.scrollBy({
        left: direction * step,
        behavior: reduceMotionRef.current ? "auto" : "smooth",
      });
    },
    []
  );

  useEffect(() => {
    reduceMotionRef.current =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const el = scrollerRef.current;
    if (!el || !deals.length) return;

    // Start in the middle copy so both directions are continuous.
    const frame = requestAnimationFrame(() => {
      const setWidth = getSetWidth();
      if (setWidth > 0) el.scrollLeft = setWidth;
    });

    const onScroll = () => normalizeLoop();
    el.addEventListener("scroll", onScroll, { passive: true });

    const onResize = () => {
      const setWidth = getSetWidth();
      if (setWidth > 0) {
        // Keep relative position within the middle set.
        const offset = el.scrollLeft % setWidth;
        el.scrollLeft = setWidth + offset;
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [deals.length, getSetWidth, normalizeLoop]);

  if (!deals.length) return null;

  const loopDeals = Array.from({ length: LOOP_COPIES }, (_, copy) =>
    deals.map((deal) => ({ deal, key: `${copy}-${deal.id}` }))
  ).flat();

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-1/2"
      aria-label="Operator deals"
    >
      <div className="pointer-events-auto relative mx-auto max-w-6xl">
        <div className="pointer-events-none absolute inset-y-0 left-2 z-10 hidden items-center md:flex lg:left-0">
          <button
            type="button"
            onClick={() => scrollByCard(-1)}
            aria-label="Scroll deals left"
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ts-ink)]/10 bg-white text-[var(--ts-ink)] shadow-[0_10px_30px_rgba(16,36,28,0.18)] transition hover:text-[var(--ts-teal)]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-2 z-10 hidden items-center md:flex lg:right-0">
          <button
            type="button"
            onClick={() => scrollByCard(1)}
            aria-label="Scroll deals right"
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--ts-ink)]/10 bg-white text-[var(--ts-ink)] shadow-[0_10px_30px_rgba(16,36,28,0.18)] transition hover:text-[var(--ts-teal)]"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={scrollerRef}
          className="flex gap-4 overflow-x-auto scroll-smooth px-5 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-5 md:px-14 lg:px-16 [&::-webkit-scrollbar]:hidden"
          role="list"
        >
          {loopDeals.map(({ deal, key }) => (
            <div key={key} data-deal-card role="listitem">
              <DealCard deal={deal} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
