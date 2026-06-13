// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import SearchableSelect from "@/components/ui/SearchableSelect";

const OPTIONS = ["Alabama", "Alaska", "Arizona", "Arkansas"];

describe("SearchableSelect", () => {
  it("shows the selected value when closed", () => {
    render(<SearchableSelect options={OPTIONS} value="Arizona" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("Arizona");
  });

  it("opens the option list and clears the input on focus", () => {
    render(<SearchableSelect options={OPTIONS} value="Arizona" onChange={() => {}} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    expect(input).toHaveValue("");
    OPTIONS.forEach((opt) => expect(screen.getByText(opt)).toBeInTheDocument());
  });

  it("filters options as the user types", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={() => {}} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ar" } });
    expect(screen.getByText("Arizona")).toBeInTheDocument();
    expect(screen.getByText("Arkansas")).toBeInTheDocument();
    expect(screen.queryByText("Alabama")).not.toBeInTheDocument();
    expect(screen.queryByText("Alaska")).not.toBeInTheDocument();
  });

  it("shows 'No matches' when nothing filters in", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={() => {}} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("calls onChange and closes the list when an option is selected", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={OPTIONS} value="" onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByText("Alaska"));
    expect(onChange).toHaveBeenCalledWith("Alaska");
    expect(screen.queryByText("Arizona")).not.toBeInTheDocument();
  });

  it("closes the list and clears the query when clicking outside", () => {
    render(
      <div>
        <SearchableSelect options={OPTIONS} value="Arizona" onChange={() => {}} />
        <button>outside</button>
      </div>
    );
    const input = screen.getByRole("textbox");
    fireEvent.focus(input);
    expect(screen.getByText("Alabama")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByText("outside"));
    expect(screen.queryByText("Alabama")).not.toBeInTheDocument();
    expect(input).toHaveValue("Arizona");
  });

  it("does not open the list when disabled", () => {
    render(<SearchableSelect options={OPTIONS} value="Arizona" onChange={() => {}} disabled />);
    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
    fireEvent.focus(input);
    expect(screen.queryByText("Alabama")).not.toBeInTheDocument();
  });
});
