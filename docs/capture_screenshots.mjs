import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

const require = createRequire("C:/Users/dalei/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/");
const { chromium } = require("playwright");

const outDir = "D:/Project/AIOCR/daily-report-ocr/docs/assets";
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();

async function loginIfNeeded() {
  if (await page.getByText("登录", { exact: true }).count()) {
    await page.getByPlaceholder("请输入用户名").fill("admin");
    await page.getByPlaceholder("请输入密码").fill("admin123");
    await page.locator("button[type='submit']").click();
    await page.waitForTimeout(1200);
  }
}

async function shot(name) {
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
}

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await loginIfNeeded();
await page.waitForTimeout(1000);
await shot("01-ocr-upload-desktop.png");

await page.getByRole("button", { name: "数据管理" }).click();
await page.waitForTimeout(1200);
await shot("02-data-management-desktop.png");

const reportRow = page.locator("tr", { hasText: "20260422-192601.jpg" }).first();
if (await reportRow.count()) {
  await reportRow.getByRole("button", { name: "查看" }).click();
} else {
  const viewButtons = await page.getByRole("button", { name: "查看" }).all();
  if (viewButtons.length) await viewButtons[0].click();
}
if (await page.getByRole("dialog", { name: "报表详情" }).count()) {
  await page.waitForTimeout(1800);
  await shot("03-review-workbench-desktop.png");
}

await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);
await shot("04-mobile-camera-upload.png");

await browser.close();
