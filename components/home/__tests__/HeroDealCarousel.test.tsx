import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  HeroDealCarousel,
  PLACEHOLDER_OPERATOR_DEALS,
} from "../HeroDealCarousel";

describe("HeroDealCarousel", () => {
  it("renders placeholder deals with prices and availability", () => {
    render(<HeroDealCarousel />);

    const first = PLACEHOLDER_OPERATOR_DEALS[0];
    // Loop copies render the same title multiple times.
    expect(screen.getAllByText(first.title).length).toBeGreaterThan(0);
    expect(screen.getAllByText(first.locationName).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Save/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$\d+/).length).toBeGreaterThan(0);
  });

  it("does not render the previous section heading copy", () => {
    render(<HeroDealCarousel />);
    expect(screen.queryByText(/Last-minute from operators/i)).toBeNull();
    expect(screen.queryByText(/Deals worth taking today/i)).toBeNull();
  });

  it("shows desktop scroll controls", () => {
    render(<HeroDealCarousel />);

    expect(
      screen.getByRole("button", { name: /Scroll deals left/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Scroll deals right/i })
    ).toBeInTheDocument();
  });

  it("returns null when there are no deals", () => {
    const { container } = render(<HeroDealCarousel deals={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
