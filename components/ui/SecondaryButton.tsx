"use client";
import React from "react";
import Button from "./Button";

type Props = Omit<React.ComponentProps<typeof Button>, "variant">;

// white-filled secondary button - shared so the hover-darken effect (.btn:hover)
// has a visible background to darken
export default function SecondaryButton({ style, ...props }: Props) {
  return <Button variant="secondary" style={{ background: "#fff", ...style }} {...props} />;
}
