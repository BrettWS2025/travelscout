import "../styles/globals.css";
import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="container pt-[160px] pb-10">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
