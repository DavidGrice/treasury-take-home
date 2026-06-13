// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import MatchBadge from "@/components/ui/MatchBadge";

describe("MatchBadge", () => {
  it("renders nothing when status is undefined", () => {
    const { container } = render(<MatchBadge status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when status is 'no-input'", () => {
    const { container } = render(<MatchBadge status="no-input" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a matched badge when status is true", () => {
    const { getByText } = render(<MatchBadge status={true} />);
    expect(getByText("✓ matched")).toBeInTheDocument();
  });

  it("renders a not-found badge when status is false", () => {
    const { getByText } = render(<MatchBadge status={false} />);
    expect(getByText("✗ not found")).toBeInTheDocument();
  });
});
