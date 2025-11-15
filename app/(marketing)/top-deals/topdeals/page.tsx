import React from "react";
import AllTravelDeals from "@/components/AllTravelDeals"; // adjust if your alias differs


export const metadata = {
title: "Top deals • Travel Scout",
description: "Up to 9 of our hottest flight, cruise and holiday deals right now.",
};


export default function TopDealsPage() {
return (
<main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
<div className="mb-8 flex items-end justify-between">
<div>
<h1 className="text-3xl font-bold tracking-tight">Top deals</h1>
<p className="mt-1 text-gray-500">
Bringing you the best deals
</p>
</div>
</div>


{/* The component below houses and renders all items. */}
<AllTravelDeals />


{/* If you want to pass deals from a CMS/API later:
<AllTravelDeals deals={myDealsFromAPI} max={9} />
*/}
</main>
);
}
