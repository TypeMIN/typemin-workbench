import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BaseballGameDebug from "./baseball-game-debug";

describe("BaseballGameDebug", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders the initial local game state and forced D12 faces", () => {
    const { container } = render(<BaseballGameDebug />);

    expect(
      screen.getByRole("heading", { name: "야구 게임 라이브" }),
    ).toBeVisible();
    expect(screen.getByText(/투구 결과를 정합니다/)).toBeVisible();
    expect(
      screen.getByRole("region", {
        name: /경기 점수판, 1회초, 무사, 주자 없음/,
      }),
    ).toBeVisible();
    expect(screen.getByLabelText("볼 0")).toBeVisible();
    expect(screen.getByLabelText("스트라이크 0")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "첫 투구를 준비하세요" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "투구 주사위 굴리기" }),
    ).toBeVisible();
    expect(container.querySelector(".bbg-d12")).toBeVisible();
    expect(screen.getAllByRole("button", { name: /번 면/ })).toHaveLength(12);
    expect(screen.getByRole("img", { name: /주자 없음/ })).toBeVisible();
    expect(screen.getByLabelText("원정팀 공격 중")).toHaveTextContent(
      "원정팀 공격",
    );
    expect(container.querySelector(".bbg-fence")).toBeVisible();
    expect(container.querySelector(".bbg-fielders")).not.toBeInTheDocument();
    expect(
      container.querySelector(".bbg-distance-marks"),
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bbg-team-score")).toHaveLength(2);
    expect(
      container.querySelectorAll(".bbg-team-score.is-batting"),
    ).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "원정팀 공격 손패" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "홈팀 수비 손패" }),
    ).toBeVisible();
    expect(container.querySelectorAll(".bbg-card-hand button")).toHaveLength(8);
  });

  it("supports random rolls and exact forced-result phase changes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<BaseballGameDebug />);

    fireEvent.click(screen.getByRole("button", { name: "투구 주사위 굴리기" }));
    expect(screen.getByLabelText("스트라이크 1")).toBeVisible();
    expect(screen.getByText("같은 타자에게 다음 투구")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /9번 면 C 컨택/ }));
    expect(
      screen.getByRole("button", { name: "타격 주사위 굴리기" }),
    ).toBeVisible();
    expect(screen.getByText(/공이 배트에 맞았습니다/)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /9번 면 HIT 안타/ }));
    expect(
      screen.getByRole("button", { name: "안타 주사위 굴리기" }),
    ).toBeVisible();
    expect(screen.getByText(/타구 방향과 모든 주자의 진루/)).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: /1번 면 IH 내야 안타/ }),
    );
    expect(
      document.querySelector('.bbg-ball-flight[aria-label*="IH"]'),
    ).toBeVisible();
    expect(screen.getByRole("img", { name: /1루 주자 있음/ })).toBeVisible();
    const result = screen.getByTestId("play-result");
    expect(
      within(result).getByRole("heading", { name: "IH 단타" }),
    ).toBeVisible();
    expect(within(result).getByText("타자")).toBeVisible();
    expect(within(result).getByText("1루")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /BK 보크 사용 가능/ }));
    expect(screen.getByText(/투구 전에 모든 주자가/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "BK 사용" }));
    expect(screen.getByRole("img", { name: /2루 주자 있음/ })).toBeVisible();
    expect(document.querySelectorAll(".bbg-card-hand button")).toHaveLength(8);
    while (screen.queryByRole("button", { name: "카드 없이 진행" })) {
      fireEvent.click(screen.getByRole("button", { name: "카드 없이 진행" }));
    }
    expect(
      screen.getByRole("button", { name: "투구 주사위 굴리기" }),
    ).toBeVisible();
  });

  it("creates a new game from edited team names and innings", () => {
    render(<BaseballGameDebug />);
    fireEvent.click(screen.getByText("새 경기 설정", { exact: true }));
    const setup = screen
      .getByText("새 경기 설정", { exact: true })
      .closest("details");
    if (!setup) throw new Error("새 경기 패널을 찾지 못했습니다.");
    const form = within(setup);

    fireEvent.change(form.getByLabelText("원정팀"), {
      target: { value: "블루" },
    });
    fireEvent.change(form.getByLabelText("홈팀"), {
      target: { value: "레드" },
    });
    fireEvent.change(form.getByLabelText("경기 길이"), {
      target: { value: "5" },
    });
    fireEvent.click(form.getByRole("button", { name: /새 경기 시작/ }));

    const scoreboard = screen.getByRole("region", { name: /경기 점수판/ });
    expect(within(scoreboard).getByText("블루")).toBeVisible();
    expect(within(scoreboard).getByText("레드")).toBeVisible();
    expect(document.querySelector(".bbg-game-length")).toHaveTextContent(
      "5이닝",
    );
  });
});
