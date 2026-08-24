import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home", () => {
  it("월드컵 예측 보드의 핵심 영역을 보여준다", async () => {
    render(<Home />);
    expect(
      await screen.findByRole("heading", { name: "월드컵 예측 내기" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "점수판" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "예측" })).toBeInTheDocument();
  });
});
