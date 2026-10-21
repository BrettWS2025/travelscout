import { describe, expect, it } from "vitest";
import {
  wouldDisableLastMandatoryChannel,
  isMandatoryEvent,
  eventLabel,
} from "@/lib/marketplace/notifications-ui";

describe("notifications-ui", () => {
  it("flags last mandatory channel turn-off", () => {
    expect(
      wouldDisableLastMandatoryChannel(
        {
          event_type: "deal_auto_paused",
          email: false,
          sms: false,
          in_app: true,
        },
        "in_app",
        false
      )
    ).toBe(true);

    expect(
      wouldDisableLastMandatoryChannel(
        {
          event_type: "deal_auto_paused",
          email: true,
          sms: false,
          in_app: true,
        },
        "in_app",
        false
      )
    ).toBe(false);

    expect(
      wouldDisableLastMandatoryChannel(
        {
          event_type: "deal_lifecycle",
          email: false,
          sms: false,
          in_app: true,
        },
        "in_app",
        false
      )
    ).toBe(false);
  });

  it("labels mandatory events", () => {
    expect(isMandatoryEvent("booking_link_broken")).toBe(true);
    expect(isMandatoryEvent("deal_lifecycle")).toBe(false);
    expect(eventLabel("attestation_due")).toMatch(/Attestation/i);
  });
});
