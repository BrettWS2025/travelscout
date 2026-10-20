import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OperatorMain } from "@/components/operator/OperatorMain";

const pathnameMock = vi.fn(() => "/");

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock(),
}));

describe("OperatorMain", () => {
  it("keeps the operator landing full-bleed (no container)", () => {
    pathnameMock.mockReturnValue("/");
    const { container } = render(
      <OperatorMain>
        <div>landing</div>
      </OperatorMain>
    );
    const main = container.querySelector("main");
    expect(main?.className).toContain("w-full");
    expect(main?.className).not.toContain("container");
    expect(screen.getByText("landing")).toBeInTheDocument();
  });

  it("uses container padding for account pages", () => {
    pathnameMock.mockReturnValue("/account/details");
    const { container } = render(
      <OperatorMain>
        <div>account</div>
      </OperatorMain>
    );
    const main = container.querySelector("main");
    expect(main?.className).toContain("container");
  });

  it("keeps quick-update mobile page full-bleed", () => {
    pathnameMock.mockReturnValue("/quick-update/tok-abc");
    const { container } = render(
      <OperatorMain>
        <div>quick</div>
      </OperatorMain>
    );
    const main = container.querySelector("main");
    expect(main?.className).toContain("w-full");
    expect(main?.className).not.toContain("container");
  });
});
