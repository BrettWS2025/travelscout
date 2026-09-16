"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, MapPin, Search, X } from "lucide-react";

export const NZ_REGIONS = [
  "Northland",
  "Auckland",
  "Coromandel",
  "Waikato",
  "Bay of Plenty",
  "Rotorua",
  "Taupō",
  "Hawke's Bay",
  "Taranaki",
  "Manawatū",
  "Wellington",
  "Nelson / Tasman",
  "Marlborough",
  "West Coast",
  "Canterbury",
  "Mackenzie",
  "Queenstown",
  "Wānaka",
  "Fiordland",
  "Southland",
] as const;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpointPx - 1}px)`).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [breakpointPx]);

  return isMobile;
}

function RegionOption({
  label,
  selected,
  onSelect,
  id,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  id: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left font-[family-name:var(--font-sora)] text-sm transition ${
        selected
          ? "bg-[var(--ts-ink)] text-white"
          : "bg-white text-[var(--ts-ink)] hover:bg-[var(--ts-mist)]"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center ${
          selected ? "opacity-100" : "opacity-0"
        }`}
        aria-hidden
      >
        <Check className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function RegionList({
  regions,
  selected,
  onSelect,
  optionIdPrefix,
}: {
  regions: readonly string[];
  selected: string;
  onSelect: (region: string) => void;
  optionIdPrefix: string;
}) {
  if (regions.length === 0) {
    return (
      <p className="px-4 py-8 text-center font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        No regions match that search.
      </p>
    );
  }

  return (
    <div role="listbox" aria-label="New Zealand regions" className="py-1">
      {regions.map((r) => (
        <RegionOption
          key={r}
          id={`${optionIdPrefix}-${normalize(r).replace(/\s+/g, "-")}`}
          label={r}
          selected={selected === r}
          onSelect={() => onSelect(r)}
        />
      ))}
    </div>
  );
}

function SearchField({
  id,
  value,
  onChange,
  placeholder,
  autoFocus,
  inputRef,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ts-muted)]"
        aria-hidden
      />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-[var(--ts-ink)]/15 bg-white py-2.5 pl-10 pr-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)] outline-none placeholder:text-[var(--ts-muted)] focus:border-[var(--ts-teal)] focus:ring-2 focus:ring-[var(--ts-teal)]/20"
      />
    </div>
  );
}

function DesktopDropdown({
  open,
  anchorRef,
  filter,
  onFilterChange,
  regions,
  selected,
  onSelect,
  listId,
  searchId,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLDivElement>;
  filter: string;
  onFilterChange: (value: string) => void;
  regions: readonly string[];
  selected: string;
  onSelect: (region: string) => void;
  listId: string;
  searchId: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open || !anchorRef.current) return;

    const update = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      id={listId}
      className="fixed z-[1200] overflow-hidden rounded-xl border border-[var(--ts-ink)]/10 bg-white shadow-[0_16px_40px_rgba(16,36,28,0.18)]"
      style={{
        top: pos.top,
        left: pos.left,
        width: Math.max(pos.width, 280),
        maxWidth: "min(100vw - 24px, 420px)",
      }}
      role="dialog"
      aria-label="Choose a region"
    >
      <div className="border-b border-[var(--ts-ink)]/8 p-3">
        <SearchField
          id={searchId}
          value={filter}
          onChange={onFilterChange}
          placeholder="Search regions"
          autoFocus
        />
      </div>
      <div className="max-h-[min(320px,50vh)] overflow-y-auto overscroll-contain">
        <RegionList
          regions={regions}
          selected={selected}
          onSelect={onSelect}
          optionIdPrefix={listId}
        />
      </div>
    </div>,
    document.body
  );
}

function MobileBottomSheet({
  open,
  filter,
  onFilterChange,
  regions,
  selected,
  onSelect,
  onClose,
  listId,
  searchId,
}: {
  open: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  regions: readonly string[];
  selected: string;
  onSelect: (region: string) => void;
  onClose: () => void;
  listId: string;
  searchId: string;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => {
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex flex-col justify-end md:hidden">
      <button
        type="button"
        aria-label="Close region picker"
        className="absolute inset-0 bg-black/55 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />
      <div
        id={listId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${listId}-title`}
        className="relative z-10 flex max-h-[70vh] min-h-[55vh] flex-col rounded-t-2xl bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.2)] animate-region-sheet-in"
      >
        <div className="relative shrink-0 border-b border-[var(--ts-ink)]/8 px-4 pb-3 pt-4">
          <h2
            id={`${listId}-title`}
            className="text-center font-[family-name:var(--font-sora)] text-base font-semibold text-[var(--ts-ink)]"
          >
            Region
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-[var(--ts-ink)] transition hover:bg-[var(--ts-mist)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <div className="mt-3">
            <SearchField
              id={searchId}
              value={filter}
              onChange={onFilterChange}
              placeholder="Search regions"
              inputRef={searchRef}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <RegionList
            regions={regions}
            selected={selected}
            onSelect={onSelect}
            optionIdPrefix={listId}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

export function HeroRegionSearch() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const listId = useId();
  const searchId = useId();
  const triggerRef = useRef<HTMLDivElement>(null);
  const [region, setRegion] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filteredRegions = useMemo(() => {
    const q = normalize(filter);
    if (!q) return NZ_REGIONS;
    return NZ_REGIONS.filter((r) => normalize(r).includes(q));
  }, [filter]);

  const close = useCallback(() => {
    setOpen(false);
    setFilter("");
  }, []);

  const openPicker = useCallback(() => {
    setFilter("");
    setOpen(true);
  }, []);

  const selectRegion = useCallback(
    (value: string) => {
      setRegion(value);
      close();
    },
    [close]
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (isMobile) return;
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      const panel = document.getElementById(listId);
      if (panel?.contains(target)) return;
      close();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, close, isMobile, listId]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = region.trim();
    if (!trimmed) {
      router.push("/find-deals");
      return;
    }
    router.push(`/find-deals?region=${encodeURIComponent(trimmed)}`);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-xl"
      aria-label="Search deals by region"
    >
      <div className="flex flex-col gap-2 rounded-2xl border border-white/20 bg-white/12 p-2 text-left shadow-[0_20px_50px_rgba(0,0,0,0.25)] backdrop-blur-md sm:flex-row sm:items-center">
        <div ref={triggerRef} className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => (open ? close() : openPicker())}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-white/8"
          >
            <MapPin className="h-5 w-5 shrink-0 text-[var(--ts-lime)]" />
            <span className="min-w-0 flex-1 truncate font-[family-name:var(--font-sora)] text-base text-white">
              {region || (
                <span className="text-white/55">
                  Queenstown, Rotorua, Bay of Plenty…
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-white/70 transition ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          </button>
          <span className="sr-only" id={`${listId}-label`}>
            Search by region
          </span>
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--ts-lime)] px-5 py-3 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:brightness-105"
        >
          <Search className="h-4 w-4" />
          Find deals
        </button>
      </div>

      {isMobile ? (
        <MobileBottomSheet
          open={open}
          filter={filter}
          onFilterChange={setFilter}
          regions={filteredRegions}
          selected={region}
          onSelect={selectRegion}
          onClose={close}
          listId={listId}
          searchId={searchId}
        />
      ) : (
        <DesktopDropdown
          open={open}
          anchorRef={triggerRef}
          filter={filter}
          onFilterChange={setFilter}
          regions={filteredRegions}
          selected={region}
          onSelect={selectRegion}
          listId={listId}
          searchId={searchId}
        />
      )}
    </form>
  );
}
