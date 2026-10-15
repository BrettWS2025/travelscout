import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeroRegionSearch, NZ_REGIONS } from "../HeroRegionSearch";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/hooks/useGeolocationRegion", () => ({
  useGeolocationRegion: () => ({
    region: null,
    place: null,
    isLoading: false,
    error: null,
    isOutsideNZ: false,
    permissionDenied: false,
  }),
}));

describe("HeroRegionSearch", () => {
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

  it("opens a desktop dropdown and filters regions as the user types", async () => {
    const user = userEvent.setup();
    render(<HeroRegionSearch />);

    await user.click(
      screen.getByRole("button", {
        name: /Auckland, Otago, Canterbury/i,
      })
    );

    const dialog = screen.getByRole("dialog", { name: /Choose a region/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Otago")).toBeInTheDocument();

    const options = within(dialog).getAllByRole("option");
    const labels = options.map((el) => el.textContent?.trim() ?? "");
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en")));
    expect(options[0].querySelector(".aspect-square")).toBeTruthy();

    await user.type(
      within(dialog).getByPlaceholderText(/Search regions/i),
      "ota"
    );

    expect(within(dialog).getByText("Otago")).toBeInTheDocument();
    expect(within(dialog).queryByText("Auckland")).not.toBeInTheDocument();
  });

  it("selects a region and submits to find-deals", async () => {
    const user = userEvent.setup();
    render(<HeroRegionSearch />);

    await user.click(
      screen.getByRole("button", {
        name: /Auckland, Otago, Canterbury/i,
      })
    );
    await user.click(screen.getByRole("option", { name: /Canterbury/i }));

    expect(
      screen.getByRole("button", { name: /Canterbury/i })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Find deals/i }));
    expect(push).toHaveBeenCalledWith(
      `/find-deals?region=${encodeURIComponent("Canterbury")}`
    );
  });

  it("opens a mobile bottom sheet with a filterable region list", async () => {
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
    render(<HeroRegionSearch />);

    await user.click(
      screen.getByRole("button", {
        name: /Auckland, Otago, Canterbury/i,
      })
    );

    const sheet = screen.getByRole("dialog", { name: /Region/i });
    expect(sheet).toBeInTheDocument();
    expect(within(sheet).getByText("Region")).toBeInTheDocument();

    await user.type(
      within(sheet).getByPlaceholderText(/Search regions/i),
      "canter"
    );

    expect(within(sheet).getByText("Canterbury")).toBeInTheDocument();
    for (const region of NZ_REGIONS) {
      if (region === "Canterbury") continue;
      expect(within(sheet).queryByText(region)).not.toBeInTheDocument();
    }
  });
});
