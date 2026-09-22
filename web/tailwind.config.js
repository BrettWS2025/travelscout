/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-instrument)", "ui-serif", "Georgia", "serif"],
        body: ["var(--font-sora)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-sora)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: { soft: "0 10px 25px rgba(0,0,0,0.08)" },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0)" },
        },
        "hero-drift": {
          "0%": { transform: "scale(1.05) translate3d(0, 0, 0)" },
          "100%": { transform: "scale(1.12) translate3d(-1.5%, -1%, 0)" },
        },
        "hero-rise": {
          "0%": { opacity: "0", transform: "translateY(28px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        marquee: "marquee 42s linear infinite",
        "marquee-reverse": "marquee-reverse 48s linear infinite",
        "hero-drift": "hero-drift 28s ease-in-out alternate infinite",
        "hero-rise": "hero-rise 1s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
    },
  },
  plugins: [],
};
