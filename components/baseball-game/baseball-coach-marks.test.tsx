import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BaseballCoachMarks } from "./baseball-coach-marks";

describe("BaseballCoachMarks", () => {
  afterEach(() => window.localStorage.clear());

  it("walks through three steps and remembers when it is done", () => {
    const { unmount } = render(<BaseballCoachMarks />);
    const guide = screen.getByRole("region", {
      name: "처음 하는 분을 위한 안내",
    });
    expect(guide).toHaveTextContent("1/3");
    expect(
      screen.getByRole("link", { name: "규칙 전체 보기" }),
    ).toHaveAttribute("href", "/baseball-game/rules");
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(guide).toHaveTextContent("3/3");
    fireEvent.click(screen.getByRole("button", { name: "시작하기" }));
    expect(
      screen.queryByRole("region", { name: "처음 하는 분을 위한 안내" }),
    ).not.toBeInTheDocument();

    unmount();
    render(<BaseballCoachMarks />);
    expect(
      screen.queryByRole("region", { name: "처음 하는 분을 위한 안내" }),
    ).not.toBeInTheDocument();
  });

  it("closes from any step", () => {
    render(<BaseballCoachMarks />);
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(window.localStorage.getItem("bbg-coach-marks-v1")).toBe("1");
  });
});
