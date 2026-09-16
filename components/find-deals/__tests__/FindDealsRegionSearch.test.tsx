import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FindDealsRegionSearch } from "../FindDealsRegionSearch";
import { NZ_REGIONS } from "@/components/RegionPicker";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("FindDealsRegionSearch", () => {
  beforeEach(() => {
    push.mockReset();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the initial region and submits an updated search", async () => {
    const user = userEvent.setup();
    render(<FindDealsRegionSearch initialRegion="Auckland" />);

    expect(screen.getByRole("button", { name: /Auckland/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Auckland/i }));
    await user.click(screen.getByRole("option", { name: /Queenstown/i }));
    await user.click(screen.getByRole("button", { name: /Search deals/i }));

    expect(push).toHaveBeenCalledWith(
      `/find-deals?region=${encodeURIComponent("Queenstown")}`
    );
  });

  it("filters regions in the desktop dropdown", async () => {
    const user = userEvent.setup();
    render(<FindDealsRegionSearch />);

    await user.click(
      screen.getByRole("button", {
        name: /Queenstown, Bay of Plenty, Rotorua/i,
      })
    );

    const dialog = screen.getByRole("dialog", { name: /Choose a region/i });
    await user.type(
      within(dialog).getByPlaceholderText(/Search regions/i),
      "fiord"
    );

    expect(within(dialog).getByText("Fiordland")).toBeInTheDocument();
    expect(within(dialog).queryByText("Auckland")).not.toBeInTheDocument();
  });

  it("opens a mobile bottom sheet that filters as the user types", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: String(query).includes("max-width"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    const user = userEvent.setup();
    render(<FindDealsRegionSearch />);

    await user.click(
      screen.getByRole("button", {
        name: /Queenstown, Bay of Plenty, Rotorua/i,
      })
    );

    const sheet = screen.getByRole("dialog", { name: /Region/i });
    await user.type(
      within(sheet).getByPlaceholderText(/Search regions/i),
      "nelson"
    );

    expect(within(sheet).getByText("Nelson / Tasman")).toBeInTheDocument();
    for (const region of NZ_REGIONS) {
      if (region === "Nelson / Tasman") continue;
      expect(within(sheet).queryByText(region)).not.toBeInTheDocument();
    }
  });
});
