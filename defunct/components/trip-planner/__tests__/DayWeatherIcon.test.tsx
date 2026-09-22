import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DayWeatherIcon from "../DayWeatherIcon";

describe("DayWeatherIcon", () => {
  it("exposes the weather description for assistive tech", () => {
    render(<DayWeatherIcon kind="rain" description="Rain" />);
    expect(screen.getByLabelText("Rain")).toBeInTheDocument();
  });
});
