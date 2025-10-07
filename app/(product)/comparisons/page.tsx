import { FilterBar } from "@/components/FilterBar";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";

export const metadata = { title: "Compare" };

// --- minimal placeholder data (empty array is fine) ---
const rows: ProductOffer[] = []; // TODO: replace with real data

// Pick any 1–10 columns you want for this page
const columns: ProductsColumn[] = [
  { key: "vendor",    header: "Agency",    sortable: true },
  { key: "brand",     header: "Brand",     sortable: true },
  { key: "price",     header: "Price",     sortable: true, align: "right" },
  { key: "dateRange", header: "Dates",     sortable: true },
  { key: "link" }, // no visible header
];

export default function Compare() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Compare Travel Cards</h1>
      <FilterBar />
      <ProductsTable rows={rows} columns={columns} />
    </section>
  );
}
