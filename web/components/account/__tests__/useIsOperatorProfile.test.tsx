import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useIsOperatorProfile } from "@/components/account/useIsOperatorProfile";

const authMock = vi.fn();
const listOrgsMock = vi.fn();
const listOperatorsMock = vi.fn();

vi.mock("@/components/AuthProvider", () => ({
  useAuth: () => authMock(),
}));

vi.mock("@/lib/marketplace/client", () => ({
  listMyOrganizations: (...args: unknown[]) => listOrgsMock(...args),
}));

vi.mock("@/lib/marketplace/operator-deals-client", () => ({
  listMyOperators: (...args: unknown[]) => listOperatorsMock(...args),
}));

describe("useIsOperatorProfile", () => {
  beforeEach(() => {
    authMock.mockReset();
    listOrgsMock.mockReset();
    listOperatorsMock.mockReset();
    listOperatorsMock.mockResolvedValue({ operators: [] });
  });

  it("treats users with organizations as operators", async () => {
    authMock.mockReturnValue({
      user: { id: "u1", user_metadata: {} },
      session: { access_token: "tok" },
      isLoading: false,
    });
    listOrgsMock.mockResolvedValue({
      organizations: [{ id: "org1", name: "Jetboat Co" }],
    });

    const { result } = renderHook(() => useIsOperatorProfile());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isOperatorProfile).toBe(true);
  });

  it("treats users with inventory operator membership as operators", async () => {
    authMock.mockReturnValue({
      user: { id: "u1b", user_metadata: {} },
      session: { access_token: "tok" },
      isLoading: false,
    });
    listOrgsMock.mockResolvedValue({ organizations: [] });
    listOperatorsMock.mockResolvedValue({
      operators: [{ id: "op1", tradingName: "Jetboat Co", role: "owner" }],
    });

    const { result } = renderHook(() => useIsOperatorProfile());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isOperatorProfile).toBe(true);
  });

  it("keeps travelers without orgs or operators as regular profiles", async () => {
    authMock.mockReturnValue({
      user: { id: "u2", user_metadata: {} },
      session: { access_token: "tok" },
      isLoading: false,
    });
    listOrgsMock.mockResolvedValue({ organizations: [] });

    const { result } = renderHook(() => useIsOperatorProfile());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isOperatorProfile).toBe(false);
  });

  it("does not treat operator signup metadata alone as an operator profile", async () => {
    authMock.mockReturnValue({
      user: { id: "u3", user_metadata: { account_type: "operator" } },
      session: { access_token: "tok" },
      isLoading: false,
    });
    listOrgsMock.mockResolvedValue({ organizations: [] });

    const { result } = renderHook(() => useIsOperatorProfile());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isOperatorProfile).toBe(false);
  });
});
