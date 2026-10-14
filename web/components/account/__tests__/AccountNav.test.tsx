import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountNav } from "@/components/account/AccountNav";
import { SiteSurfaceProvider } from "@/components/SiteSurfaceContext";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/details",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function renderNav(surface: "main" | "operator") {
  return render(
    <SiteSurfaceProvider surface={surface}>
      <AccountNav />
    </SiteSurfaceProvider>
  );
}

describe("AccountNav", () => {
  it("shows operator sections on the operator portal", () => {
    renderNav("operator");
    expect(screen.getAllByText("Account details").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inventory").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Log out").length).toBeGreaterThan(0);
  });

  it("hides inventory and settings for regular travelers", () => {
    renderNav("main");
    expect(screen.getAllByText("Account details").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Log out").length).toBeGreaterThan(0);
    expect(screen.queryByText("Inventory")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("toggles the mobile menu", () => {
    renderNav("operator");
    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
