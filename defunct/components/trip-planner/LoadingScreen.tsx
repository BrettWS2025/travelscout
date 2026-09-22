"use client";

import { useEffect, useState, useMemo } from "react";

type LoadingScreenProps = {
  isLoading: boolean;
};

export default function LoadingScreen({ isLoading }: LoadingScreenProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Generate particle positions once to prevent re-renders from changing them
  const particles = useMemo(() => {
    return [...Array(20)].map((_, i) => ({
      id: i,
      size: Math.random() * 4 + 2,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 4,
    }));
  }, []);

  useEffect(() => {
    if (isLoading) {
      setIsVisible(true);
      setIsExiting(false);
    } else if (isVisible) {
      // Start exit animation
      setIsExiting(true);
      // Hide after animation completes
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsExiting(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, isVisible]);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#f8fafc] transition-opacity duration-500 ${
        isExiting ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute rounded-full bg-[var(--accent)] opacity-10 animate-float"
            style={{
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Animated compass/globe icon */}
        <div className="relative">
          <div className="relative w-24 h-24">
            {/* Outer rotating ring */}
            <div className="absolute inset-0 border-4 border-[var(--accent)]/20 rounded-full animate-spin-slow">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-[var(--accent)] rounded-full" />
            </div>
            
            {/* Middle pulsing ring */}
            <div className="absolute inset-2 border-2 border-[var(--accent)]/40 rounded-full animate-pulse" />
            
            {/* Inner compass */}
            <div className="absolute inset-4 flex items-center justify-center">
              <svg
                viewBox="0 0 32 32"
                className="w-full h-full text-[var(--accent)]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="16" cy="16" r="14" />
                <path d="M16 2 L16 8 M16 24 L16 30 M2 16 L8 16 M24 16 L30 16" />
                <path d="M16 8 L12 12 L16 16 L20 12 Z" fill="currentColor" />
                <path d="M16 24 L12 20 L16 16 L20 20 Z" fill="currentColor" opacity="0.5" />
              </svg>
            </div>
          </div>
        </div>

        {/* Loading text with typing effect */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[var(--text)] mb-2">
            Planning your journey
          </h2>
          <div className="flex items-center gap-2 justify-center">
            <span className="text-[var(--accent)] text-sm font-medium">
              Generating itinerary
            </span>
            <div className="flex gap-1">
              <span
                className="inline-block w-1 h-1 bg-[var(--accent)] rounded-full animate-bounce"
                style={{ animationDelay: "0s" }}
              />
              <span
                className="inline-block w-1 h-1 bg-[var(--accent)] rounded-full animate-bounce"
                style={{ animationDelay: "0.2s" }}
              />
              <span
                className="inline-block w-1 h-1 bg-[var(--accent)] rounded-full animate-bounce"
                style={{ animationDelay: "0.4s" }}
              />
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-64 h-1 bg-[var(--muted)]/20 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[var(--accent)] via-[var(--brand)] to-[var(--accent)] rounded-full animate-progress" />
        </div>
      </div>
    </div>
  );
}
