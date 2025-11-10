import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import WhenToBookCarousel from "@/components/WhenToBookCarousel";

import dynamic from "next/dynamic";
const DomesticFlightBookingTimingChart = dynamic(
  () => import("@/components/DomesticFlightBookingTimingChart"),
  { ssr: false }
);
const AusPacificFlightBookingTimingChart = dynamic(
  () => import("@/components/AusPacificFlightBookingTimingChart"),
  { ssr: false }
);
// NEW: International
const InternationalFlightBookingTimingChart = dynamic(
  () => import("@/components/InternationalFlightBookingTimingChart"),
  { ssr: false }
);


