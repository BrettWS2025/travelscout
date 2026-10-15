import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountNav } from "@/components/account/AccountNav";

const operatorProfileMock = vi.fn(() => ({
  isOperatorProfile: false,
  isLoading: false,
}));
const signOutMock = vi.fn(async () => undefined);

vi.mock("next/navigation", () => ({
  usePathname: () => "/account/details",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/components/account/useIsOperatorProfile", () => ({
  useIsOperatorProfile: () => operatorProfileMock(),
}));

vi.mock("@/components/account/useAccountSignOut", () => ({
  useAccountSignOut: () => signOutMock,
}));

describe("AccountNav", () => {
  beforeEach(() => {
    operatorProfileMock.mockReturnValue({
      isOperatorProfile: false,
      isLoading: false,
    });
    signOutMock.mockClear();
  });

  it("shows operator sections for operator profiles", () => {
    operatorProfileMock.mockReturnValue({
      isOperatorProfile: true,
      isLoading: false,
    });
    render(<AccountNav />);
    expect(screen.getAllByText("Account details").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inventory").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Log out" }).length).toBeGreaterThan(0);
  });

  it("hides inventory and settings for regular traveler profiles", () => {
    render(<AccountNav />);
    expect(screen.getAllByText("Account details").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Log out" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Inventory")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();
  });

  it("logs out immediately when Log out is clicked", () => {
    render(<AccountNav />);
    fireEvent.click(screen.getAllByRole("button", { name: "Log out" })[0]);
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("toggles the mobile menu", () => {
    operatorProfileMock.mockReturnValue({
      isOperatorProfile: true,
      isLoading: false,
    });
    render(<AccountNav />);
    const toggle = screen.getByRole("button", { expanded: false });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
