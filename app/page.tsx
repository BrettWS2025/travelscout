import Link from "next/link";
import { MapPin, Calendar, Compass, Sparkles, Route, BookOpen, Star } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-16 md:space-y-24">
      {/* Hero Section */}
      <section className="card p-8 md:p-12 lg:p-16 mt-6 md:mt-8">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm">
            <Sparkles className="w-4 h-4" />
            <span>Plan your perfect New Zealand journey</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mt-6">
            Discover New Zealand
            <br />
            <span className="text-[var(--accent)]">Your Way</span>
          </h1>
          
          <p className="text-lg md:text-xl text-gray-300 max-w-2xl mx-auto">
            Plan your journey across Aotearoa with our intelligent trip planner. 
            Book events and attractions along the way, and create the perfect itinerary 
            tailored to your travel style.
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
            <Link
              href="/trip-planner"
              className="px-6 py-3 rounded-full font-semibold text-slate-900 transition-transform hover:scale-105 active:scale-95"
              style={{ 
                background: "var(--accent)",
                boxShadow: "0 10px 25px rgba(0,0,0,0.15)"
              }}
            >
              Start Planning Your Trip
            </Link>
            <Link
              href="/guides"
              className="px-6 py-3 rounded-full font-semibold border border-white/20 hover:bg-white/5 transition-colors"
              style={{ color: "var(--text)" }}
            >
              Explore Destinations
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="card p-8 md:p-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Planning your New Zealand adventure is simple and intuitive
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--accent)]/20 flex items-center justify-center">
                <Route className="w-8 h-8 text-[var(--accent)]" />
              </div>
              <h3 className="text-xl font-semibold">Plan Your Route</h3>
              <p className="text-gray-300">
                Choose your start and end destinations, add places to visit, and let our 
                intelligent planner create the perfect route for your journey.
              </p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--accent)]/20 flex items-center justify-center">
                <Calendar className="w-8 h-8 text-[var(--accent)]" />
              </div>
              <h3 className="text-xl font-semibold">Book Events & Attractions</h3>
              <p className="text-gray-300">
                Discover and book exciting events, activities, and attractions along your route. 
                From adventure sports to cultural experiences, find it all in one place.
              </p>
            </div>
            
            <div className="text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--accent)]/20 flex items-center justify-center">
                <Compass className="w-8 h-8 text-[var(--accent)]" />
              </div>
              <h3 className="text-xl font-semibold">Explore & Enjoy</h3>
              <p className="text-gray-300">
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
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need</h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Powerful tools to make your New Zealand journey unforgettable
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <MapPin className="w-8 h-8 text-[var(--accent)] mb-4" />
              <h3 className="text-xl font-semibold mb-2">Smart Route Planning</h3>
              <p className="text-gray-300">
                Our intelligent system calculates the best route between destinations, 
                factoring in realistic driving times and scenic stops.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <BookOpen className="w-8 h-8 text-[var(--accent)] mb-4" />
              <h3 className="text-xl font-semibold mb-2">Book Activities</h3>
              <p className="text-gray-300">
                Browse and book events, tours, and attractions directly through your itinerary. 
                Everything organized in one place.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <Star className="w-8 h-8 text-[var(--accent)] mb-4" />
              <h3 className="text-xl font-semibold mb-2">Curated Recommendations</h3>
              <p className="text-gray-300">
                Get personalized suggestions for places to visit and things to do based on 
                your route and travel preferences.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <Route className="w-8 h-8 text-[var(--accent)] mb-4" />
              <h3 className="text-xl font-semibold mb-2">Flexible Itineraries</h3>
              <p className="text-gray-300">
                Easily adjust your trip - add or remove stops, change dates, and modify 
                your journey as your plans evolve.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <Calendar className="w-8 h-8 text-[var(--accent)] mb-4" />
              <h3 className="text-xl font-semibold mb-2">Day-by-Day Planning</h3>
              <p className="text-gray-300">
                See your entire trip broken down day by day with suggested activities, 
                accommodation options, and travel times.
              </p>
            </div>
            
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <Compass className="w-8 h-8 text-[var(--accent)] mb-4" />
              <h3 className="text-xl font-semibold mb-2">New Zealand Focused</h3>
              <p className="text-gray-300">
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
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Popular Destinations</h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Start your journey from these popular New Zealand destinations
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { name: "Auckland", region: "North Island", description: "City of Sails" },
              { name: "Wellington", region: "North Island", description: "Capital City" },
              { name: "Christchurch", region: "South Island", description: "Garden City" },
              { name: "Queenstown", region: "South Island", description: "Adventure Capital" },
            ].map((destination) => (
              <Link
                key={destination.name}
                href="/trip-planner"
                className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-[var(--accent)]/50 transition-all group"
              >
                <h3 className="text-xl font-semibold mb-1 group-hover:text-[var(--accent)] transition-colors">
                  {destination.name}
                </h3>
                <p className="text-sm text-gray-400 mb-2">{destination.region}</p>
                <p className="text-gray-300 text-sm">{destination.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="card p-12 md:p-16 lg:p-20 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold">
            Ready to Plan Your Adventure?
          </h2>
          <p className="text-lg md:text-xl text-gray-300">
            Start creating your perfect New Zealand journey today. Plan your route, 
            discover amazing places, and book unforgettable experiences.
          </p>
          <div className="pt-4">
            <Link
              href="/trip-planner"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-semibold text-slate-900 transition-transform hover:scale-105 active:scale-95"
              style={{ 
                background: "var(--accent)",
                boxShadow: "0 10px 25px rgba(0,0,0,0.15)"
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
