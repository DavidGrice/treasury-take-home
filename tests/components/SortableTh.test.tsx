// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import SortableTh from "@/components/ui/SortableTh";

function renderTh(props: Partial<React.ComponentProps<typeof SortableTh>> = {}) {
  const defaults: React.ComponentProps<typeof SortableTh> = {
    label: "Brand",
    sortKey: "brand",
    currentKey: "brand",
    currentDir: "asc",
    onSort: () => {},
  };
  return render(
    <table>
      <thead>
        <tr>
          <SortableTh {...defaults} {...props} />
        </tr>
      </thead>
    </table>
  );
}

describe("SortableTh", () => {
  it("shows an ascending arrow when active and sorted ascending", () => {
    const { getByText, container } = renderTh({ currentKey: "brand", currentDir: "asc" });
    expect(getByText("Brand")).toBeInTheDocument();
    expect(container.querySelector("th")).toHaveTextContent("▲");
    expect(container.querySelector("th")).toHaveClass("sortable-th--active");
  });

  it("shows a descending arrow when active and sorted descending", () => {
    const { container } = renderTh({ currentKey: "brand", currentDir: "desc" });
    expect(container.querySelector("th")).toHaveTextContent("▼");
  });

  it("shows no arrow and no active class when not the active column", () => {
    const { container } = renderTh({ currentKey: "id", currentDir: "asc" });
    const th = container.querySelector("th")!;
    expect(th).not.toHaveClass("sortable-th--active");
    expect(th.textContent).not.toMatch(/[▲▼]/);
  });

  it("calls onSort with its sortKey when clicked", () => {
    const onSort = vi.fn();
    const { container } = renderTh({ sortKey: "brand", onSort });
    fireEvent.click(container.querySelector("th")!);
    expect(onSort).toHaveBeenCalledWith("brand");
  });
});
