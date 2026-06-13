// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import FilterStat from "@/components/ui/FilterStat";

describe("FilterStat", () => {
  it("renders the label and count", () => {
    const { getByText } = render(<FilterStat label="Pending" count={7} active={false} onSelect={() => {}} />);
    expect(getByText("Pending")).toBeInTheDocument();
    expect(getByText("7")).toBeInTheDocument();
  });

  it("applies the active class when active", () => {
    const { container } = render(<FilterStat label="Pending" count={7} active onSelect={() => {}} />);
    expect(container.firstElementChild).toHaveClass("dashboard-filter--active");
  });

  it("omits the active class when inactive", () => {
    const { container } = render(<FilterStat label="Pending" count={7} active={false} onSelect={() => {}} />);
    expect(container.firstElementChild).not.toHaveClass("dashboard-filter--active");
  });

  it("calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    const { container } = render(<FilterStat label="Pending" count={7} active={false} onSelect={onSelect} />);
    fireEvent.click(container.firstElementChild!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
