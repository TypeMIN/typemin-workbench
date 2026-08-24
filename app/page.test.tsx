import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Workbench home", () => {
  it("links to both apps", () => {
    render(<Home />);

    expect(
      screen.getByRole("link", { name: "오늘 뭐 먹지? 열기" }),
    ).toHaveAttribute("href", "/what-should-eat");
    expect(
      screen.getByRole("link", { name: "월드컵 예측 내기 열기" }),
    ).toHaveAttribute("href", "/worldcup-prediction");
  });
});
