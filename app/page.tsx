import Link from "next/link";
import { MapPin, Calendar, Compass, Sparkles, Route, BookOpen, Star } from "lucide-react";
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
    <div className="space-y-16 md:space-y-24">
      {/* Hero Section */}
      <section className="card p-8 md:p-12 lg:p-16 mt-6 md:mt-8" style={{ background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)" }}>
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/50 text-sm font-medium text-blue-700 shadow-sm">
            <Sparkles className="w-4 h-4" />
            <span>Plan your perfect New Zealand journey</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mt-6 font-[family-name:var(--font-plus-jakarta)]">
            <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Discover New Zealand
            </span>
            <br />
            <span className="bg-gradient-to-r from-emerald-500 to-teal-600 bg-clip-text text-transparent">
              Your Way
            </span>
          </h1>
          
          <p className="text-lg md:text-xl text-slate-700 max-w-2xl mx-auto font-medium">
            <span style={{ display: 'none' }}>Impact-Site-Verification: 321bf81b-5895-4010-9e67-52c4f2342cc0</span>
            Plan your journey across Aotearoa with our intelligent trip planner. 
            Book events and attractions along the way, and create the perfect itinerary 
            tailored to your travel style.
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
            <Link
              href="/trip-planner"
              className="px-8 py-4 rounded-full font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-lg hover:shadow-xl"
              style={{ 
                background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              }}
            >
              Start Planning Your Trip
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="card p-8 md:p-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-[family-name:var(--font-plus-jakarta)] text-slate-800">How It Works</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto font-medium">
              Planning your New Zealand adventure is simple and intuitive
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-4 p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                <Route className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)]">Plan Your Route</h3>
              <p className="text-slate-600">
                Choose your start and end destinations, add places to visit, and let our 
                intelligent planner create the perfect route for your journey.
              </p>
            </div>
            
            <div className="text-center space-y-4 p-6 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-md">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)]">Book Events & Attractions</h3>
              <p className="text-slate-600">
                Discover and book exciting events, activities, and attractions along your route. 
                From adventure sports to cultural experiences, find it all in one place.
              </p>
            </div>
            
            <div className="text-center space-y-4 p-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 hover:shadow-lg transition-shadow">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                <Compass className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 font-[family-name:var(--font-plus-jakarta)]">Explore & Enjoy</h3>
              <p className="text-slate-600">
                Get your personalized itinerary with driving times, recommended stops, 
                and all your booked activities. Hit the road and make memories!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="card p-8 md:p-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-[family-name:var(--font-plus-jakarta)] text-slate-800">Everything You Need</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto font-medium">
              Powerful tools to make your New Zealand journey unforgettable
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-4 shadow-md">
                <MapPin className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-slate-800 font-[family-name:var(--font-plus-jakarta)]">Smart Route Planning</h3>
              <p className="text-slate-600">
                Our intelligent system calculates the best route between destinations, 
                factoring in realistic driving times and scenic stops.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-purple-300 hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-4 shadow-md">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-slate-800 font-[family-name:var(--font-plus-jakarta)]">Book Activities</h3>
              <p className="text-slate-600">
                Browse and book events, tours, and attractions directly through your itinerary. 
                Everything organized in one place.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-amber-300 hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center mb-4 shadow-md">
                <Star className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-slate-800 font-[family-name:var(--font-plus-jakarta)]">Curated Recommendations</h3>
              <p className="text-slate-600">
                Get personalized suggestions for places to visit and things to do based on 
                your route and travel preferences.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center mb-4 shadow-md">
                <Route className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-slate-800 font-[family-name:var(--font-plus-jakarta)]">Flexible Itineraries</h3>
              <p className="text-slate-600">
                Easily adjust your trip - add or remove stops, change dates, and modify 
                your journey as your plans evolve.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-pink-300 hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center mb-4 shadow-md">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-slate-800 font-[family-name:var(--font-plus-jakarta)]">Day-by-Day Planning</h3>
              <p className="text-slate-600">
                See your entire trip broken down day by day with suggested activities, 
                accommodation options, and travel times.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-teal-300 hover:shadow-lg transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center mb-4 shadow-md">
                <Compass className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-slate-800 font-[family-name:var(--font-plus-jakarta)]">New Zealand Focused</h3>
              <p className="text-slate-600">
                Built specifically for exploring Aotearoa, with comprehensive coverage of 
                cities, towns, and scenic stops across both islands.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Destinations */}
      <section className="card p-8 md:p-12">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 font-[family-name:var(--font-plus-jakarta)] text-slate-800">Popular Destinations</h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto font-medium">
              Start your journey from these popular New Zealand destinations
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: "Auckland", region: "North Island", description: "City of Sails", color: "from-blue-500 to-cyan-500" },
              { name: "Wellington", region: "North Island", description: "Capital City", color: "from-purple-500 to-pink-500" },
              { name: "Christchurch", region: "South Island", description: "Garden City", color: "from-emerald-500 to-teal-500" },
              { name: "Queenstown", region: "South Island", description: "Adventure Capital", color: "from-orange-500 to-amber-500" },
            ].map((destination) => (
              <Link
                key={destination.name}
                href="/trip-planner"
                className="p-6 rounded-2xl bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-xl transition-all group relative overflow-hidden"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${destination.color} opacity-0 group-hover:opacity-5 transition-opacity`}></div>
                <div className="relative">
                  <h3 className="text-xl font-bold mb-1 group-hover:text-indigo-600 transition-colors font-[family-name:var(--font-plus-jakarta)] text-slate-800">
                    {destination.name}
                  </h3>
                  <p className="text-sm text-slate-500 mb-2 font-medium">{destination.region}</p>
                  <p className="text-slate-600 text-sm">{destination.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="card p-12 md:p-16 lg:p-20 text-center" style={{ background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)" }}>
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold font-[family-name:var(--font-plus-jakarta)] bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Ready to Plan Your Adventure?
          </h2>
          <p className="text-lg md:text-xl text-slate-700 font-medium">
            Start creating your perfect New Zealand journey today. Plan your route, 
            discover amazing places, and book unforgettable experiences.
          </p>
          <div className="pt-4">
            <Link
              href="/trip-planner"
              className="inline-flex items-center gap-2 px-10 py-5 rounded-full font-bold text-white transition-all hover:scale-105 active:scale-95 shadow-xl hover:shadow-2xl"
              style={{ 
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
              }}
            >
              <Compass className="w-5 h-5" />
              Start Planning Now
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
