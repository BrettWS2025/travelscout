export type Package = {
  package_id: string;
  source: string;
  url: string;
  title: string;
  destinations: string[];
  duration_days: number;
  nights?: number | null;
  price: number;
  currency: string;
  price_basis: "per_person" | "total" | string;
  price_nzd?: number;
  price_pppn?: number;
  includes?: {
    flights?: boolean;
    hotel?: boolean;
    board?: string | null;
    transfers?: boolean | null;
    activities?: string[];
  };
  hotel?: { name?: string|null; stars?: number|null; room_type?: string|null };
  sale_ends_at?: string | null;
  last_seen_at: string;
};
