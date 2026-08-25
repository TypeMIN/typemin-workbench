import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

describe("Workbench home", () => {
  it("links to both apps", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    render(<Home />);

    expect(
      screen.getByRole("link", { name: "오늘 뭐 먹지? 열기" }),
    ).toHaveAttribute("href", "/what-should-eat");
    expect(
      screen.getByRole("link", { name: "월드컵 예측 내기 열기" }),
    ).toHaveAttribute("href", "/worldcup-prediction");
    expect(screen.getByText("1개 운영 · 1개 완료")).toBeVisible();
    expect(
      within(
        screen.getByRole("link", { name: "월드컵 예측 내기 열기" }),
      ).getByText("아카이브"),
    ).toBeVisible();
  });
});

afterEach(() => vi.unstubAllGlobals());
