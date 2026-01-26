/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-plus-jakarta)', 'ui-sans-serif', 'system-ui'],
        body: ['var(--font-plus-jakarta)', 'ui-sans-serif', 'system-ui'],
        sans: ['var(--font-plus-jakarta)', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: { soft: "0 10px 25px rgba(0,0,0,0.08)" }
    },
  },
  plugins: [],
};
