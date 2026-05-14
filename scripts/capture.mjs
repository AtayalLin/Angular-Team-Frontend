import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const OUT = join(homedir(), 'Desktop', '懶飽飽_截圖');
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:4200';
const done = [];
const failed = [];

async function shot(page, filename, fullPage = false) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, filename), fullPage });
  console.log('✓', filename);
  done.push(filename);
}

const browser = await chromium.launch({ headless: true });

// ── 1. 客戶端 (mobile 390×844) ────────────────────────────────────────────
try {
  console.log('\n── 客戶端 ──');
  const ctx = await browser.newContext({ ...devices['iPhone 13 Pro'] });
  const page = await ctx.newPage();

  // 登入
  await page.goto(BASE + '/customer-login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 填帳號密碼
  const accountInput = page.locator('input').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await accountInput.fill('test@lazybao.com');
  await passwordInput.fill('test1234');
  await page.locator('button[type="submit"], button:has-text("登入"), button:has-text("Login")').first().click();
  await page.waitForURL('**/customer-home', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);

  // 01 客戶菜單
  await shot(page, '01_customer_menu.png');

  // 02 購物車（點購物車圖示）
  const cartBtn = page.locator('[class*="cart"], [class*="basket"], button:has([class*="cart"])').first();
  if (await cartBtn.isVisible().catch(() => false)) {
    await cartBtn.click();
    await page.waitForTimeout(600);
  }
  await shot(page, '02_customer_cart.png');

  // 03 會員中心
  await page.goto(BASE + '/customer-member', { waitUntil: 'networkidle' });
  await shot(page, '03_customer_member.png');

  await ctx.close();
} catch (e) {
  console.error('客戶端截圖失敗:', e.message);
  failed.push('01-03_customer (error: ' + e.message + ')');
}

// ── 2. POS 終端機 (desktop 1440×900) ─────────────────────────────────────
try {
  console.log('\n── POS 終端機 ──');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.goto(BASE + '/staff-login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const accountInput = page.locator('input').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await accountInput.fill('staff@lazybao.com');
  await passwordInput.fill('staff1234');
  await page.locator('button.s-submit, button:has-text("進入管理後台")').first().click();
  await page.waitForURL('**/pos-terminal', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // 04 POS 主畫面
  await shot(page, '04_pos_cockpit.png');

  // 05 結帳畫面（嘗試點選結帳按鈕）
  const checkoutBtn = page.locator('button:has-text("結帳"), button:has-text("Checkout"), [class*="checkout"]').first();
  if (await checkoutBtn.isVisible().catch(() => false)) {
    await checkoutBtn.click();
    await page.waitForTimeout(800);
  }
  await shot(page, '05_pos_checkout.png');

  await ctx.close();
} catch (e) {
  console.error('POS 截圖失敗:', e.message);
  failed.push('04-05_pos (error: ' + e.message + ')');
}

// ── 3. 管理後台 (desktop 1440×900) ──────────────────────────────────────
try {
  console.log('\n── 管理後台 ──');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.goto(BASE + '/staff-login', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const accountInput = page.locator('input').first();
  const passwordInput = page.locator('input[type="password"]').first();
  await accountInput.fill('admin@lazybao.com');
  await passwordInput.fill('admin1234');
  await page.locator('button.s-submit, button:has-text("進入管理後台")').first().click();
  await page.waitForURL('**/manager-dashboard', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // 06 後台首頁（預設落點）
  await shot(page, '06_admin_dashboard.png');

  // 07 活動管理 tab
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.nav-item'));
    const t = items.find(el => el.textContent.includes('活動'));
    if (t) t.click();
  });
  await page.waitForTimeout(1000);
  await shot(page, '07_admin_products.png');

  // 08 帳號管理 tab（或國家設定）
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.nav-item'));
    const t = items.find(el => el.textContent.includes('帳號') || el.textContent.includes('國家'));
    if (t) t.click();
  });
  await page.waitForTimeout(1000);
  await shot(page, '08_admin_promotions.png');

  await ctx.close();
} catch (e) {
  console.error('管理後台截圖失敗:', e.message);
  failed.push('06-08_admin (error: ' + e.message + ')');
}

await browser.close();

console.log('\n══════════════════════════════════════');
console.log('完成！輸出路徑：', OUT);
console.log('成功：', done.join(', '));
if (failed.length) console.log('待補：', failed.join('\n       '));
console.log('══════════════════════════════════════');
