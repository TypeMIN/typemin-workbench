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
    expect(screen.getByRole("heading", { name: "프로젝트" })).toBeVisible();
    expect(
      within(
        screen.getByRole("link", { name: "월드컵 예측 내기 열기" }),
      ).getByText("아카이브"),
    ).toBeVisible();
    const mealCard = within(
      screen.getByRole("link", { name: "오늘 뭐 먹지? 열기" }),
    );
    expect(
      mealCard.getByRole("list", { name: "오늘 뭐 먹지? 주요 기능" }),
    ).toHaveTextContent("메뉴 선택");
    expect(mealCard.getByText("장소 추천")).toBeVisible();

    const worldcupCard = within(
      screen.getByRole("link", { name: "월드컵 예측 내기 열기" }),
    );
    expect(
      worldcupCard.getByRole("list", {
        name: "월드컵 예측 내기 주요 기능",
      }),
    ).toHaveTextContent("예측 결과");
    expect(worldcupCard.getByText("점수판")).toBeVisible();
    expect(
      screen.queryByText("함께 고르는 오늘의 한 끼와 장소 추천"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("완료된 5인 월드컵 예측 결과 아카이브"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("TYPEMIN · PERSONAL LAB"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("작은 웹앱을 만들고 직접 사용하는 공간입니다."),
    ).not.toBeInTheDocument();
  });
});

afterEach(() => vi.unstubAllGlobals());
