import { FilterBar } from "@/components/FilterBar";
import { ComparisonTable } from "@/components/ComparisonTable";

export const metadata = { title: "Compare" };

export default function Compare() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Compare Travel Cards</h1>
      <FilterBar />
      <ProductsTable rows={rows} columns={columns} />
    </section>
  );
}
