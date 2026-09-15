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
    expect(screen.getByText(first.title)).toBeInTheDocument();
    expect(screen.getByText(first.locationName)).toBeInTheDocument();
    expect(screen.getAllByText(/Save/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$\d+/).length).toBeGreaterThan(0);
  });

  it("renders heading copy above the cards", () => {
    render(<HeroDealCarousel />);
    expect(screen.getByText(/Last-minute from operators/i)).toBeInTheDocument();
    expect(screen.getByText(/Deals worth taking today/i)).toBeInTheDocument();
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
