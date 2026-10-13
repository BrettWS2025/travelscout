import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountNav } from "@/components/account/AccountNav";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/details",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

describe("AccountNav", () => {
  it("renders all account sections", () => {
    render(<AccountNav />);
    expect(screen.getAllByText("Account details").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inventory").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Log out").length).toBeGreaterThan(0);
  });

  it("toggles the mobile menu", () => {
    render(<AccountNav />);
    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
