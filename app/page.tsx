import Link from "next/link";
import Image from "next/image";
import { MapPin, Menu, Heart } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Plan Your New Zealand Journey | TravelScout",
  description: "Discover New Zealand your way. Plan your journey across Aotearoa with our intelligent trip planner. Book events and attractions along the way, and create the perfect itinerary tailored to your travel style.",
  openGraph: {
    title: "Plan Your New Zealand Journey | TravelScout",
    description: "Discover New Zealand your way. Plan your journey across Aotearoa with our intelligent trip planner.",
  },
};

export default function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section className="relative w-screen min-h-[78vh] md:min-h-screen -mt-[120px] -mb-px overflow-hidden ml-[calc(50%-50vw)]">
            <Image
              src="/Main_Page_Pic.jpg"
              alt="New Zealand Landscape"
              fill
              priority
              className="object-cover brightness-125"
              sizes="100vw"
            />
        <div className="absolute inset-0 bg-black/35"></div>
        <div className="absolute inset-x-0 bottom-0 h-24 md:h-36 bg-gradient-to-b from-transparent via-slate-100/40 to-[#f8fafc]"></div>
        
        {/* Text content */}
        <div className="relative z-10 min-h-[78vh] md:min-h-screen pt-28 md:pt-28">
          <div className="container h-full flex items-center px-4 md:px-0">
            <div className="max-w-3xl space-y-4 md:space-y-6 text-left translate-y-10 md:translate-y-14">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold leading-[1.05] tracking-tight font-[family-name:var(--font-plus-jakarta)] text-white">
              Discover New Zealand.
              <br />
              Your way.
              </h1>
            
              <p className="text-lg md:text-xl text-white/90 max-w-2xl font-medium">
                <span style={{ display: 'none' }}>Impact-Site-Verification: 321bf81b-5895-4010-9e67-52c4f2342cc0</span>
                Plan it. Map it. Price it. Live it.
              </p>
            
              <div className="pt-1">
                <Link
                  href="/trip-planner"
                  className="inline-flex items-center gap-2 text-white text-lg md:text-lg font-medium border-b border-white/80 pb-1 hover:border-white transition-colors"
                >
                  Plan your Trip
                  <span aria-hidden>›</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Everything You Need */}
      <section className="mt-0 md:mt-2 p-8 md:p-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-[family-name:var(--font-plus-jakarta)] text-slate-800">Everything You <span className="italic">Need</span></h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: Personal Concierge Card */}
            <div className="relative rounded-2xl p-8 md:p-10 bg-slate-800 text-white overflow-hidden">
              {/* Background decorative shapes */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-10 right-10 w-32 h-32 rounded-full bg-green-300 blur-3xl"></div>
                <div className="absolute bottom-10 left-10 w-24 h-24 rounded-full bg-green-200 blur-2xl"></div>
              </div>
              
              {/* Content */}
              <div className="relative z-10 flex flex-col h-full">
                {/* Icon */}
                <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center mb-6">
                  <Menu className="w-5 h-5 text-white" />
                </div>
                
                {/* Title */}
                <h3 className="text-2xl md:text-3xl font-bold mb-4 font-[family-name:var(--font-plus-jakarta)]">
                  Your Personal Concierge
                </h3>
                
              </div>
            </div>
            
            {/* Right: Feature Cards */}
            <div className="flex flex-col gap-6">
              {/* Activity Booking Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                     <h3 className="text-base font-bold text-slate-800 mb-2 font-[family-name:var(--font-plus-jakarta)] leading-tight">
                       Activity and event booking
                     </h3>
                  </div>
                  {/* Activity Image Placeholder */}
                  <div className="flex-shrink-0 w-20 h-20 rounded-lg bg-amber-50 border border-amber-200 flex flex-col items-center justify-center p-2">
                    <div className="w-10 h-10 flex items-end justify-center mb-1">
                      {/* Person walking silhouette */}
                      <div className="w-3 h-3 rounded-full bg-slate-700 mb-1"></div>
                      <div className="w-4 h-6 bg-slate-700 rounded-sm ml-0.5"></div>
                    </div>
                    <span className="text-[8px] text-slate-600 font-medium">ACTIVITY</span>
                  </div>
                </div>
              </div>
              
              {/* Bottom two cards side-by-side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Smart Recommendations Card */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-lg transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-purple-600 flex-shrink-0 border border-slate-200">
                      <Heart className="w-5 h-5 fill-current" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-slate-800 mb-2 font-[family-name:var(--font-plus-jakarta)] leading-tight">
                        Smart Recommendations
                      </h3>
                    </div>
                  </div>
                </div>
                
                {/* Digital Travel Journal Card */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 hover:shadow-lg transition-shadow">
                  <div className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-blue-600 flex-shrink-0 border border-slate-200">
                      <MapPin className="w-5 h-5 fill-current" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-slate-800 mb-2 font-[family-name:var(--font-plus-jakarta)] leading-tight">
                        Digital Travel Journal
                      </h3>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="px-8 md:px-12">
        <div className="max-w-6xl mx-auto">
          <div className="w-2/3 md:w-1/2 h-px bg-slate-300/70 mx-auto"></div>
        </div>
      </div>

      {/* Escape Down Under */}
      <section className="p-8 md:p-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-left mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)]" style={{ textShadow: '2px 2px 4px rgba(0, 0, 0, 0.1)' }}>
              Escape <span className="italic">Down</span>
              <br />
              <span className="italic">Under</span>
            </h2>
          </div>
          
          <div className="relative">
            {/* Image */}
            <div className="relative rounded-2xl overflow-visible aspect-[16/9] max-w-3xl">
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                <Image
                  src="/wanakatree.jpg"
                  alt="Wānaka"
                  fill
                  className="object-cover rounded-2xl"
                  sizes="(max-width: 768px) 100vw, 66vw"
                />
              </div>
              
              {/* Content Card overlay - half on image, half off */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-full md:w-[50%] md:-mr-[25%] z-20 hidden md:block">
                <div className="bg-white rounded-2xl p-5 md:px-8 md:py-5 border border-slate-200 shadow-lg">
                  <div className="space-y-2">
                    {/* Subtitle */}
                    <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                      SOUTHERN ALPS
                    </p>
                    
                    {/* Main Title */}
                    <h3 className="text-xl md:text-2xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)]">
                      Wānaka
                    </h3>
                    
                    {/* Description/Quote */}
                    <p className="text-slate-600 leading-relaxed text-xs">
                      A stunning resort town home to the Rhythm and Alps festival and a number of Gold Medal winning athletes. Hit the slopes at Cardrona Ski Field, check out the Cardrona Hotel or take a swim in the stunning Wānaka lake while you overlook the gorgeous Southern Alps
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Mobile: Content Card below image */}
            <div className="md:hidden mt-4">
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-lg">
                <div className="space-y-2">
                  {/* Subtitle */}
                  <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                    SOUTHERN ALPS
                  </p>
                  
                  {/* Main Title */}
                  <h3 className="text-xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)]">
                    Wānaka
                  </h3>
                  
                  {/* Description/Quote */}
                  <p className="text-slate-600 leading-relaxed text-xs">
                    A stunning resort town home to the Rhythm and Alps festival and a number of Gold Medal winning athletes. Hit the slopes at Cardrona Ski Field, check out the Cardrona Hotel or take a swim in the stunning Wānaka lake while you overlook the gorgeous Southern Alps
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Second Destination - Swapped Layout */}
          <div className="relative mt-12">
            {/* Image on Right */}
            <div className="relative rounded-2xl overflow-visible aspect-[16/9] max-w-3xl ml-auto">
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                <Image
                  src="/Bayofislands.jpg"
                  alt="Bay of Islands"
                  fill
                  className="object-cover rounded-2xl"
                  sizes="(max-width: 768px) 100vw, 66vw"
                />
              </div>
              
              {/* Content Card overlay - left side, half on image, half off */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full md:w-[50%] md:-ml-[25%] z-20 hidden md:block">
                <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 md:px-8 md:py-5 border border-slate-200/50 shadow-lg">
                  <div className="space-y-2">
                    {/* Subtitle */}
                    <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide">
                      NORTHLAND
                    </p>
                    
                    {/* Main Title */}
                    <h3 className="text-xl md:text-2xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)]">
                      Bay of Islands
                    </h3>
                    
                    {/* Description/Quote */}
                    <p className="text-slate-600 leading-relaxed text-xs">
                      A subtropical micro-region known for its stunning beauty and history. 144 islands to explore by sail or air.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Mobile: Content Card below image */}
            <div className="md:hidden mt-4">
              <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 border border-slate-200/50 shadow-lg">
                <div className="space-y-2">
                  {/* Subtitle */}
                  <p className="text-[10px] font-semibold text-purple-500 uppercase tracking-wide">
                    NORTHLAND
                  </p>
                  
                  {/* Main Title */}
                  <h3 className="text-xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)]">
                    Bay of Islands
                  </h3>
                  
                  {/* Description/Quote */}
                  <p className="text-slate-600 leading-relaxed text-xs">
                    A subtropical micro-region known for its stunning beauty and history. 144 islands to explore by sail or air.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Next big Event */}
      <section className="card p-8 md:p-12 mt-16 md:mt-24" style={{ borderRadius: 0 }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-2 font-[family-name:var(--font-plus-jakarta)] text-blue-900">
              Next big <span className="italic">Event</span>
            </h2>
          </div>
          
          <div className="space-y-8">
            {/* First Event - Image 01 on Left, Text on Right */}
            <div className="grid md:grid-cols-2 gap-8 items-start">
              <div className="relative rounded-2xl overflow-hidden w-full">
                <div className="relative w-full">
                  <img
                    src="/gunsnrosesbanner.jpg"
                    alt="Guns N' Roses World Tour 2026"
                    className="w-full h-auto object-contain rounded-2xl"
                  />
                </div>
              </div>
              
              <div className="flex flex-col justify-center text-center md:text-left h-full">
                <h3 className="text-xl md:text-2xl font-bold text-slate-800 mb-2 font-[family-name:var(--font-plus-jakarta)]">
                  Guns N' Roses : World Tour 2026
                </h3>
                <p className="text-slate-600 text-sm mb-3 leading-relaxed">
                  Guns N' Roses return to the stage for the first time since 2022. Don't miss it!
                </p>
                <ul className="space-y-1.5 text-slate-600 text-sm">
                  <li className="flex items-center justify-center md:justify-start">
                    <span className="w-2 h-2 bg-blue-600 mr-2 flex-shrink-0"></span>
                    <span><span className="font-semibold">Date:</span> 17th December</span>
                  </li>
                  <li className="flex items-center justify-center md:justify-start">
                    <span className="w-2 h-2 bg-blue-600 mr-2 flex-shrink-0"></span>
                    <span><span className="font-semibold">Venue:</span> Eden Park, Auckland</span>
                  </li>
                </ul>
              </div>
            </div>
            
            {/* Second Event - Text on Left, Image 02 on Right (Small) */}
            <div className="grid md:grid-cols-2 gap-8">
              {/* Mobile: Image first, Desktop: Text first */}
              <div className="order-2 md:order-1 flex flex-col justify-center text-center md:text-left">
                <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-2 font-[family-name:var(--font-plus-jakarta)]">
                  DHL Super Rugby Pacific Super Round
                </h3>
                <p className="text-slate-600 text-sm mb-3 leading-relaxed">
                  Super Round 2026 brings three days of world-class rugby and family-friendly fun to Ōtautahi, Christchurch
                </p>
                <ul className="space-y-1.5 text-slate-600 text-sm">
                  <li className="flex items-center justify-center md:justify-start">
                    <span className="w-2 h-2 bg-blue-600 mr-2 flex-shrink-0"></span>
                    <span><span className="font-semibold">Date:</span> 24-26th April</span>
                  </li>
                  <li className="flex items-center justify-center md:justify-start">
                    <span className="w-2 h-2 bg-blue-600 mr-2 flex-shrink-0"></span>
                    <span><span className="font-semibold">Venue:</span> One NZ Stadium, Christchurch</span>
                  </li>
                </ul>
              </div>
              {/* Mobile: Image second, Desktop: Image second */}
              <div className="order-1 md:order-2 relative rounded-2xl overflow-hidden w-full max-w-[240px] mx-auto md:mx-0">
                <div className="relative w-full">
                  <img
                    src="/superrugbysuperround.jpg"
                    alt="DHL Super Rugby Pacific Super Round"
                    className="w-full h-auto object-contain rounded-2xl"
                  />
                </div>
              </div>
            </div>
            
            {/* Third Event - Image 03 on Left, Text on Right (Medium size) */}
            <div className="grid md:grid-cols-2 gap-8 items-start">
              <div className="relative rounded-2xl overflow-hidden w-full">
                <div className="relative w-full">
                  <img
                    src="/jazzfestival.jpg"
                    alt="2026 National Jazz Festival"
                    className="w-full h-auto object-contain rounded-2xl"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-center text-center md:text-left h-full">
                <h3 className="text-lg md:text-xl font-bold text-slate-800 mb-2 font-[family-name:var(--font-plus-jakarta)]">
                  2026 National Jazz Festival
                </h3>
                <p className="text-slate-600 text-sm mb-3 leading-relaxed">
                  The National Jazz Festival stretches across eleven vibrant days, filling Tauranga and Mount Maunganui with world-class jazz, unforgettable performances, and a city-wide celebration of music and community
                </p>
                <ul className="space-y-1.5 text-slate-600 text-sm">
                  <li className="flex items-center justify-center md:justify-start">
                    <span className="w-2 h-2 bg-blue-600 mr-2 flex-shrink-0"></span>
                    <span><span className="font-semibold">Dates:</span> 27th March - 7th April</span>
                  </li>
                  <li className="flex items-center justify-center md:justify-start">
                    <span className="w-2 h-2 bg-blue-600 mr-2 flex-shrink-0"></span>
                    <span><span className="font-semibold">Venue:</span> Various Across Mt Maunganui and Tauranga</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
