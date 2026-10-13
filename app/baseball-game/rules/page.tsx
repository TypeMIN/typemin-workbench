import type { Metadata } from "next";
import Link from "next/link";

import { CARD_TIMING_LABEL } from "@/components/baseball-game/baseball-card-face";
import {
  CARD_DEFINITIONS,
  type CardDefinition,
} from "@/lib/baseball-game/cards";
import { HAND_SIZE } from "@/lib/baseball-game/engine";
import {
  BATTER_DUEL_HIT_BONUS,
  PITCHER_DUEL_HIT_PENALTY,
  PITCH_TENDENCIES,
} from "@/lib/baseball-game/duel";
import {
  DECISION_LIMIT_MS,
  FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS,
  MIN_DECISION_AFTER_LOCK_MS,
  TEAM_TIMEOUTS_PER_GAME,
  TIMEOUT_EXTENSION_MS,
} from "@/lib/baseball-game/multiplayer/shot-clock";
import { PARTY_TEAM_CAPACITY } from "@/lib/baseball-game/party/types";
import type { CardRole, CardTiming } from "@/lib/baseball-game/types";

import "../rules.css";

export const metadata: Metadata = {
  title: { absolute: "야구 게임 규칙" },
  description: "투타 심리전, 전략카드, 샷클락과 모드별 진행 방법",
};

const TIMING_ORDER: CardTiming[] = [
  "before_pitch",
  "after_pitch",
  "after_contact",
  "after_batting",
  "after_hit",
];

const ROLE_LABEL: Record<CardRole, string> = {
  offense: "공격 카드",
  defense: "수비 카드",
};

function seconds(ms: number) {
  return Math.round(ms / 1_000);
}

function deckSize(role: CardRole) {
  return Object.values(CARD_DEFINITIONS)
    .filter((card) => card.role === role)
    .reduce((total, card) => total + card.copies, 0);
}

function cardsFor(role: CardRole) {
  return Object.values(CARD_DEFINITIONS)
    .filter((card) => card.role === role)
    .sort(
      (left, right) =>
        TIMING_ORDER.indexOf(left.timing) -
          TIMING_ORDER.indexOf(right.timing) ||
        left.name.localeCompare(right.name, "ko"),
    );
}

export default function BaseballRulesPage() {
  const strike = PITCH_TENDENCIES.strike;
  const ball = PITCH_TENDENCIES.ball;
  return (
    <main className="bbg-rules">
      <header className="bbg-rules-header">
        <Link href="/baseball-game">← 경기로 돌아가기</Link>
        <h1>야구 게임 규칙</h1>
        <p>
          한 타석은 투수와 타자의 심리전으로 시작합니다. 카드는 정해진 순간에만
          꺼낼 수 있습니다.
        </p>
      </header>

      <section aria-labelledby="rules-flow">
        <h2 id="rules-flow">한 투구의 흐름</h2>
        <ol className="bbg-rules-steps">
          <li>
            <strong>투구 전 카드</strong>
            <span>
              도루, 견제처럼 투구 전에 쓰는 카드를 공격팀부터 차례로 선언하거나
              넘깁니다.
            </span>
          </li>
          <li>
            <strong>투타 동시 선택</strong>
            <span>
              투수는 스트라이크와 볼, 타자는 스윙과 지켜보기 중 하나를 서로
              기다리지 않고 고릅니다. 상대가 골랐는지는 보이지만 무엇을
              골랐는지는 보이지 않고, 한 번 고르면 바꿀 수 없습니다.
            </span>
          </li>
          <li>
            <strong>판정과 장면</strong>
            <span>
              두 선택이 모이면 서버가 판정하고 모든 화면이 같은 장면을
              재생합니다. 장면이 끝나기 전에는 결과가 보이지 않습니다.
            </span>
          </li>
          <li>
            <strong>판정 뒤 카드</strong>
            <span>
              투구 직후, 공에 맞힌 뒤, 타구와 안타 판정 뒤에 쓰는 카드로 결과를
              바꿀 수 있습니다.
            </span>
          </li>
        </ol>
      </section>

      <section aria-labelledby="rules-duel">
        <h2 id="rules-duel">투타 심리전</h2>
        <div className="bbg-rules-table" role="table" aria-label="선택 조합">
          <div role="row">
            <span role="columnheader" />
            <span role="columnheader">스윙</span>
            <span role="columnheader">지켜보기</span>
          </div>
          <div role="row">
            <span role="rowheader">스트라이크</span>
            <span role="cell" data-winner="batter">
              <b>타자 유리</b>
              컨택 {strike.contact}% · 파울 {strike.foul}% · 헛스윙{" "}
              {strike.whiff}%
            </span>
            <span role="cell" data-winner="pitcher">
              <b>투수 유리</b>
              스트라이크
            </span>
          </div>
          <div role="row">
            <span role="rowheader">볼</span>
            <span role="cell" data-winner="pitcher">
              <b>투수 유리</b>
              헛스윙 {ball.whiff}% · 파울 {ball.foul}% · 컨택 {ball.contact}%
            </span>
            <span role="cell" data-winner="batter">
              <b>타자 유리</b>볼
            </span>
          </div>
        </div>
        <p className="bbg-rules-note">
          타자가 유리한 조합에서 맞힌 공은 안타·홈런 확률이{" "}
          {BATTER_DUEL_HIT_BONUS}%p 오르고, 투수가 유리한 조합에서 맞힌 공은{" "}
          {PITCHER_DUEL_HIT_PENALTY}%p 내려가 땅볼·뜬공이 됩니다. 볼 넷은 볼넷,
          스트라이크 셋은 삼진입니다.
        </p>
      </section>

      <section aria-labelledby="rules-clock">
        <h2 id="rules-clock">샷클락</h2>
        <ul className="bbg-rules-list">
          <li>
            시계는 장면이 끝난 뒤 시작합니다. 투구{" "}
            {seconds(DECISION_LIMIT_MS.awaiting_pitch)}초, 스윙{" "}
            {seconds(DECISION_LIMIT_MS.awaiting_swing)}초, 카드{" "}
            {seconds(DECISION_LIMIT_MS.awaiting_card)}초입니다.
          </li>
          <li>
            투수와 타자는 한 기한을 함께 씁니다. 한쪽이 먼저 골라도 상대에게는
            최소 {seconds(MIN_DECISION_AFTER_LOCK_MS)}초가 남습니다.
          </li>
          <li>
            시간이 지나면 투구는 무작위, 스윙은 지켜보기, 카드는 넘기기로 자동
            진행됩니다.
          </li>
          <li>
            멀티플레이는 팀마다 타임아웃 {TEAM_TIMEOUTS_PER_GAME}번(
            {seconds(TIMEOUT_EXTENSION_MS)}초 연장)이 있고, 상대가{" "}
            {FORFEIT_AFTER_CONSECUTIVE_TIMEOUTS}번 연속 시간을 넘기면 몰수승을
            요청할 수 있습니다.
          </li>
        </ul>
      </section>

      <section aria-labelledby="rules-modes">
        <h2 id="rules-modes">모드</h2>
        <dl className="bbg-rules-modes">
          <div>
            <dt>AI 대전</dt>
            <dd>한 기기에서 원정이나 홈을 골라 AI와 겨룹니다.</dd>
          </div>
          <div>
            <dt>멀티플레이</dt>
            <dd>
              두 기기가 한 방에 들어가 각자 손패를 숨긴 채 겨룹니다. 링크나 QR로
              초대합니다.
            </dd>
          </div>
          <div>
            <dt>파티플레이</dt>
            <dd>
              TV 같은 공용 화면에 경기장을 띄우고, 팀마다 최대{" "}
              {PARTY_TEAM_CAPACITY}명이 휴대폰으로 참가합니다. 타순대로 돌아가며
              결정하고, 방장은 한 명에게 운영 권한을 줄 수 있습니다.
            </dd>
          </div>
        </dl>
      </section>

      {(["offense", "defense"] as const).map((role) => (
        <section aria-labelledby={`rules-cards-${role}`} key={role}>
          <h2 id={`rules-cards-${role}`}>
            {ROLE_LABEL[role]} <small>{deckSize(role)}장</small>
          </h2>
          <p className="bbg-rules-note">
            손패는 {HAND_SIZE}장입니다. 쓴 카드는 덱에서 보충하고, 덱이 비면
            버린 카드를 섞어 다시 씁니다. 지금 쓸 수 있는 카드만 밝게 표시되고,
            쓸 카드가 없는 순간은 건너뜁니다.
          </p>
          <ul className="bbg-rules-cards">
            {cardsFor(role).map((card: CardDefinition) => (
              <li key={card.id}>
                <span className="bbg-rules-card-code">{card.id}</span>
                <strong>{card.name}</strong>
                <em>
                  {CARD_TIMING_LABEL[card.timing]} · {card.copies}장
                </em>
                <p>{card.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
