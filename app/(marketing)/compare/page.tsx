import { FilterBar } from "@/components/FilterBar";
import ProductsTable, { type ProductsColumn } from "@/components/ComparisonTable";
import type { ProductOffer } from "@/lib/products";

export const metadata = { title: "Compare" };

const rows: ProductOffer[] = []; // empty is fine

const columns: ProductsColumn[] = [
  { key: "vendor",    header: "Agency" },
  { key: "brand",     header: "Brand" },
  { key: "price",     header: "Price", align: "right", sortable: true },
  { key: "dateRange", header: "Dates", sortable: true },
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
