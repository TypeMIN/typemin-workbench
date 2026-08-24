import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, type FullConfig } from "@playwright/test";

export default async function globalSetup(config: FullConfig) {
  const shareUrl = process.env.VERCEL_SHARE_URL;
  if (!shareUrl) return;

  const storageState = config.projects[0]?.use.storageState;
  if (typeof storageState !== "string") {
    throw new Error("Vercel Preview storageState 경로가 없습니다.");
  }

  await mkdir(path.dirname(storageState), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(shareUrl, { waitUntil: "domcontentloaded" });
  await context.storageState({ path: storageState });
  await browser.close();
}
