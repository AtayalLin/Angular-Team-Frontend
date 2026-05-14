# 懶飽飽 LazyBaoBao

> 台灣在地美食訂餐平台，提供客戶點餐、員工 POS 操作與老闆管理後台一體化解決方案。

---

## 專案簡介

**懶飽飽（LazyBaoBao）** 是一個以 Angular 19 開發的餐飲全端管理系統，包含三個主要入口：

- **客戶端**：會員登入、訪客快速點餐、完整下單流程（菜單 → 購物車 → 結帳 → 付款 → 訂單追蹤）
- **員工 POS 終端**：分店長與員工點餐收銀操作介面，含商品分類篩選、搜尋、稅金計算、訂單看板
- **老闆管理後台**：8 個功能頁籤全功能管理，含商品、庫存、活動、帳號、稅率、財務報表

---

## 技術棧

| 技術             | 版本 / 說明                                           |
| ---------------- | ----------------------------------------------------- |
| Angular          | 19.x（standalone components）                        |
| TypeScript       | 5.6.x                                                 |
| SCSS             | CSS Custom Properties（本地 theme 變數）              |
| Bootstrap        | 5.3.8（CDN，僅管理後台 / POS 使用）                  |
| Node.js          | 建議 v22 LTS                                          |
| lottie-web       | 5.13.x（npm）                                         |
| dotlottie-wc     | 0.9.3（CDN）                                          |
| gsap             | 3.14.x（Loading 動畫）                                |
| ldrs             | 1.1.x（純 CSS Loading 指示器）                        |
| aos              | 2.3.4（Animate On Scroll）                            |
| RxJS             | 7.8.x                                                 |
| Angular Signals  | 內建（Angular 19，所有狀態管理以 signal / computed 驅動） |

---

## 開發環境啟動

```bash
# 安裝依賴套件
npm install

# 啟動開發伺服器（預設 http://localhost:4200）
ng serve
```

---

## API 模式切換（Mock 離線 ↔ 真實後端）

前端預設為 **離線 Mock 模式**，不需開啟 Eclipse 或資料庫，即可完整操作整個訂單流程。

### 切換方式

只需修改一個檔案的一個數值：

**[`src/app/shared/api.config.ts`](src/app/shared/api.config.ts)**

```ts
MOCK_MODE: true,   // ← true = 離線 Demo（預設）
                   // ← false = 串接真實後端（需開 Eclipse + DB）
```

### 兩種模式對照

| 情境 | `MOCK_MODE` 值 | 需要 Eclipse | 需要 DB |
|------|:--------------:|:------------:|:-------:|
| Demo 展示 / 前端開發 | `true` | ❌ | ❌ |
| 完整 API 串接測試 | `false` | ✅ | ✅ |

### Mock 模式行為說明

Mock 模式下，以下 5 個 API 不發出 HTTP 請求，直接回傳假資料：

| API 端點 | 假回傳內容 |
|----------|------------|
| `cart/sync_item` | `{ cartId: 9999, ... }` |
| `cart/remove_item` | `{ cartId: 9999, ... }` |
| `cart/clear_cart` | `{ cartId: 9999, ... }` |
| `orders/create_order` | `{ id: 'DEMO', orderDateId: '今日日期', ... }` |
| `orders/pay` | `{ code: 200, message: 'ok' }` |

> 其餘狀態（購物車本地清單、訂單追蹤、歷史訂單）完全正常運作，流程與真實串接完全一致。

---

## Demo 公開連線設定（ngrok）

本專案的行動支付 QR Code 採用 `window.location.origin` 動態產生網址，**不需修改任何程式碼**，只要透過 ngrok 對外公開即可讓手機掃碼連線。

### 必要工具

- **ngrok**：[下載頁面](https://ngrok.com/download) 或 `winget install ngrok.ngrok`
- 安裝後執行一次：
  ```bash
  ngrok config add-authtoken <TOKEN>
  ```
  > Token 請向專案負責人索取

### 每次啟動步驟

**終端機 1 — 啟動前端：**
```bash
ng serve
```

**終端機 2 — 建立公開通道：**
```bash
ngrok http 4200
```

ngrok 啟動後會顯示類似下列的公開網址：
```
Forwarding  https://xxxx-xx-xx-xxx.ngrok-free.app → http://localhost:4200
```

**將該 ngrok 網址（而非 localhost）分享給手機掃碼**，QR Code 就會自動指向正確的公開網址。

### 注意事項

| 情境 | QR Code 指向 | 手機可掃 |
|------|-------------|---------|
| 直接用 `localhost:4200` 開啟 | `localhost:4200/mobile-pay` | ❌ 僅本機 |
| 用 ngrok 網址開啟 | `https://xxxx.ngrok-free.app/mobile-pay` | ✅ 任何人 |

- ngrok 免費版每次重啟網址會更換，重新執行 `ngrok http 4200` 即可，**不需改任何程式碼**
- `angular.json` 已設定允許所有 ngrok 網域（`allowedHosts`），換網址後免重設
- 手機掃碼時，電腦的 `ng serve` 與 `ngrok` 都必須保持執行中

### 設定說明（`src/app/shared/demo.config.ts`）

```ts
// 若需強制指定 QR Code 目標網址（例：在 localhost 操作但 QR 指向 ngrok）
// 可修改此檔案，否則 QR Code 自動使用當前瀏覽器的 origin
export const DEMO_BASE_URL = 'https://your-ngrok-url.ngrok-free.app';
```

> 目前 `mobilePayUrl` 使用 `window.location.origin`，此設定檔**尚未啟用**。
> 如需切換，請告知開發者啟用 `DEMO_BASE_URL`。

### 掃碼付款實際運作流程

1. 客戶端結帳頁選擇「行動支付」
2. 系統以 `window.location.origin` 動態產生 QR Code URL，格式如下：
   ```
   https://<ngrok-url>/mobile-pay?store=懶飽飽&amount=<金額>&items=<品項JSON>
   ```
3. 手機掃描 QR Code → 開啟 `/mobile-pay` 付款確認頁
4. 手機畫面點擊「確認付款」→ 電腦端觸發成功動畫並完成訂單建立

> **注意**：手機掃碼頁（`/mobile-pay`）會自動在請求標頭帶入 `ngrok-skip-browser-warning: true`，跳過 ngrok 免費版的警告頁面，直接進入付款確認頁。

---

## 路由一覽

| 路徑                 | 頁面                       | 可存取角色              |
| -------------------- | -------------------------- | ----------------------- |
| `/`                  | 自動導向 `/staff-login`    | —                       |
| `/staff-login`       | 管理系統登入               | 所有人                  |
| `/customer-login`    | 客戶入口登入               | 所有人                  |
| `/customer-register` | 客戶註冊                   | 所有人                  |
| `/customer-guest`    | 訪客快速點餐（無需帳號）   | 所有人                  |
| `/customer-home`     | 客戶主頁（菜單 + 購物車）  | customer、guest         |
| `/customer-member`   | 客戶會員中心               | customer                |
| `/manager-dashboard` | 老闆管理後台               | boss                    |
| `/pos-terminal`      | 分店長 / 員工 POS 終端     | branch_manager、staff   |
| `/mobile-pay`        | 手機掃碼付款確認頁         | 所有人（由 QR Code 導入） |

---

## 三種身份功能完整說明

---

### 一、客戶端（`/customer-home`）

適用角色：`customer`（正式會員）、`guest`（訪客）

#### 底部導覽列

| 頁籤     | 說明                                  | 訪客可用 |
| -------- | ------------------------------------- | -------- |
| 首頁     | 品牌展示、主廚推薦卡片、今日優惠橫向捲動、活動輪播 | ✅ |
| 菜單     | 全商品列表、分類篩選、關鍵字搜尋       | ✅      |
| 購物車   | 購物車確認、付款方式選擇（含信用卡 / 行動支付流程）、送出訂單 | ✅ |
| 訂單追蹤 | 即時訂單狀態追蹤（waiting/cooking/ready/done）| ✅ |
| 我的訂單 | 歷史訂單（已完成 / 已取消 / 已退款）  | ❌ 隱藏 |
| 活動專區 | 目前進行中的促銷活動與公告（未來功能） | ✅      |

#### 首頁功能
- **精選商品卡片 & 今日優惠**：所有價格統一使用 Fraunces serif italic 橙色字體（NT$ 大數字顯示）
- **今日優惠橫向捲動**：左右兩端各有 `<` / `>` 按鈕可手動捲動
- **活動輪播（Promo Banner）**：3 個活動 SVG 圖示 + 說明輪播，每 3 秒自動切換（可手動點圓點切換），不溢出不跑版

#### 菜單頁功能
- **分類篩選**：全部 / 飯食 / 麵食 / 小吃 / 輕食 / 飲品
- **關鍵字搜尋**：即時模糊比對商品名稱，分類與搜尋可同時作用
- **商品卡**：真實食物照片（有圖優先，無圖 fallback emoji + 漸層底色），價格統一 Fraunces serif italic 橙色
- **加入購物車**：點擊商品卡加入，重複點擊累加數量；觸覺回饋（`navigator.vibrate(30ms)`）；每次加入即同步後端 `cart/sync_item`（eager sync）

#### 結帳頁功能
- **購物車列表**：品項增減數量（減至 0 自動移除）、單項刪除（同步 `cart/remove_item`）、清空（同步 `cart/clear_cart`）
- **滿額贈品下拉**：小計 ≥ $300 顯示贈品選擇下拉（含「不需要滿額免費贈品」選項），已選贈品顯示於品項列（$0）
- **活動優惠下拉**：小計達活動門檻後出現，先選活動再從該活動專屬贈品清單挑選（兩層下拉）
  - 新會員首單禮（≥$150）、週末滿額禮（≥$300）、消費達人大禮包（≥$500）
- **折扣券**：累積訂單達 10 次後出現，使用則本次享 8 折優惠
- **訂單預覽 Modal**：按「進入結帳頁面」會先彈出訂單確認視窗，供客戶最後確認，可按「上一步」返回修改或按「確認建立訂單」前往付款
- **聯絡電話**：取代舊版備註欄
  - 會員自動帶入已登記電話號碼（唯讀預填）
  - 訪客為必填欄位，未填寫時送出按鈕鎖定
- **付款方式**：信用卡 / 行動支付 / 現金（3 種）
- **送出訂單**：
  1. 按下後顯示 spinner（防重複送出）
  2. 使用 eager sync 已建立的購物車 ID（若無則 fallback 逐筆 `sync_item`）
  3. 呼叫 `orders/create_order`（UNPAID）→ `orders/pay`（COMPLETED）
  4. 建立 `LiveOrder` 並推送至 `OrderService`（POS 看板即時同步）
  5. 新增至本地歷史訂單
  6. 清空本地購物車（後端 DB 明細保留供訂單歷史查詢）
  7. 自動跳至訂單追蹤頁

#### 付款頁功能
- 唯讀訂單摘要（品項 / 贈品 / 活動贈品 / 折扣 / 總計）
- 「取消本次訂單，返回首頁」按鈕：清空購物車並導回首頁
- **信用卡付款流程（完整 Demo）**：
  - 3D 翻轉信用卡視覺（CSS `perspective` + `rotateY`，深藍漸層正面 / 磁條背面）
  - 卡號輸入自動格式化（4 碼一空格）、到期日自動補斜線、CVV 聚焦翻轉卡片
  - 表單驗證：16 碼卡號、MM/YY 格式、CVV ≥ 3 碼、持卡人姓名不為空，全部通過才可送出
  - Demo 信用卡：`4532 1234 5678 9012`，到期 `12/28`，CVV `123`，持卡人 `LAI PAO PAO`
- **行動支付流程（完整 Demo）**：
  - 顯示 SVG QR Code（手繪 finder pattern + 資料模組，純裝飾用）含付款金額 badge
  - 「模擬手機掃碼」→ 跳出手機外框 Modal，顯示完整訂單品項列表
  - 手機畫面「確認付款」→ 觸發成功動畫（ripple 擴散 + 圓形縮放 + 打勾路徑描繪 + 文字淡入）
  - 2.2 秒後自動關閉 Modal 並完成訂單建立流程

#### 訂單追蹤頁
- 即時讀取 `OrderService.latestCustomerOrder()`
- 顯示訂單號碼、品項、金額、預估等待分鐘、狀態進度條
- 狀態：`waiting`（等待備餐）→ `cooking`（備餐中）→ `ready`（可取餐）→ `done`（完成）

#### 側邊欄（個人資料 / 訪客）
- **訪客**：顯示「訪客 G」頭像，無法開啟個人資料抽屜
- **會員**：點擊頭像卡展開個人資料抽屜（CSS Grid 動畫）
  - 可編輯姓名 / 手機 / 密碼（含密碼顯示切換）
  - 儲存後即時同步 `sessionStorage`，重整不回復
  - **折扣券紀錄**：顯示累積點餐次數進度（每 10 次可換 1 張 8 折折扣券），達成顯示「可使用」badge；使用折扣券後從第 1 次重新累積，不使用則維持在 10 次

#### 訂單管理頁（僅會員）
- 子頁籤：已完成 / 已取消 / 已退款
- 顯示訂單 ID、日期、品項描述、金額
- 下單後即時插入最新訂單（最新在最上方）
- **申請退款按鈕**：僅「已完成」訂單右下角顯示玫瑰紅線框膠囊按鈕
  - 點擊彈出退款申請 Modal（毛玻璃遮罩 + 彈性滑入動畫）
  - 7 項退款原因可複選（餐點品項錯誤 / 異物異味 / 未熟透 / 份量不足 / 已冷卻 / 包裝破損 / 過敏原未告知）
  - 「其他問題」自由填寫欄
  - 未勾選任何項目時送出按鈕禁用（灰化）
  - 送出後顯示綠色打勾成功動畫，2 秒自動關閉

---

### 二、員工 POS 終端（`/pos-terminal`）

適用角色：`branch_manager`（分店長）、`staff`（員工）

登入分頁：**現場收銀員**（`S` 頁籤）

#### 頁籤一覽

| 頁籤     | 說明                                      | 員工 | 分店長 |
| -------- | ----------------------------------------- | ---- | ------ |
| 點餐 POS | 商品卡點擊下單、購物車、結帳              | ✅   | ✅     |
| 訂單看板 | 依狀態分欄（waiting/cooking/done）、狀態流轉按鈕 | ✅ | ✅  |
| 庫存速查 | 各商品庫存量、低庫存 badge 警示、inline 調整數量 | ✅（唯讀） | ✅（可調整） |
| 促銷快覽 | 當前促銷活動列表                          | ✅   | ✅     |
| 員工帳號 | 帳號列表 + 新增員工 Modal + 停/復權       | ❌   | ✅     |
| 報表查詢 | 本店今日報表（待接後端）                  | ❌   | ✅     |

#### 點餐 POS 頁功能
- **分類篩選**：全部 / 台式 / 西式 / 飲品 / 輕食（按鈕切換）
- **關鍵字搜尋**：比對商品中文名稱 + 英文名稱
- **商品卡**：純文字精美餐飲按鈕（品名 + NT$ 價格 + `+` 符號），深色漸層背景，無 SVG 圖示與 badge 標籤
- **會員點餐模式**：查詢會員（Email 或手機號碼，比對時忽略 `-`），顯示折扣券累積次數進度；訪客模式僅填手機號碼
- **購物車面板**：品項數量增減、小計、合計（台灣無附加營業稅）
- **滿額贈品**：小計 ≥ $300 時顯示贈品下拉（含「不需要」選項），已選贈品顯示於品項列（$0，無 +/- 符號）
- **活動優惠**：與客戶端相同，兩層下拉（選活動 → 選贈品）
- **折扣券**：會員達 10 次時顯示，使用則 8 折，不使用維持在 10 次
- **付款方式**：現金 / 信用卡 / 行動支付
- **現金計算機**：選擇現金付款後跳出 POS 數字鍵盤 overlay，支援快速金額按鈕、找零計算，找零不足時確認按鈕 disabled
- **結帳**：推送 `LiveOrder` 至 `OrderService` → 客戶追蹤即時同步；顯示 3 秒結帳成功動畫

#### 訂單看板
- 三欄：等待備餐 / 備餐中 / 已完成
- 「開始備餐」按鈕：`waiting → cooking`
- 「完成取餐」按鈕：`cooking → done`
- 訂單卡顯示：訂單號、建立時間、品項、金額、付款方式、來源（POS / 客戶端）

#### 庫存速查（分店長 inline 調整）
1. 點擊「調整」→ 輸入框 inline 出現
2. 修改數量 → 確認
3. 顯示「已儲存」提示 1.8 秒後消失

#### 員工帳號管理（分店長專屬）
- 新增員工：姓名 / 帳號 / 班別（早班 / 晚班 / 假日班）
- 停用 / 恢復 員工帳號（即時切換）

#### 即時時鐘
- 右上角顯示 `YYYY/MM/DD 星期X HH:MM:SS`，每秒更新

---

### 三、老闆管理後台（`/manager-dashboard`）

適用角色：`boss`（老闆）

登入分頁：**系統經理**（`M` 頁籤）

#### 側邊欄 8 個頁籤

| 頁籤     | 說明                                                        |
| -------- | ----------------------------------------------------------- |
| 綜合總覽 | 今日營業額、訂單數、熱銷商品、低庫存警示卡片                |
| 訂單管理 | 即時訂單列表、狀態篩選（下拉）、分頁                        |
| 商品管理 | 商品列表、分類篩選 + 搜尋、上架 / 下架 toggle（Signal 驅動）|
| 活動管理 | 促銷活動列表（活動 / 公告分類）、啟用 / 停用 toggle、右側滑入新增面板（含圖片上傳、顏色選擇、日期區間、最低消費設定） |
| 庫存管理 | 各分店食材庫存量、低庫存（< safeStock）紅色警示、inline 調整 |
| 帳號管理 | 分店長子頁籤 + 員工子頁籤，停 / 復權（Signal 驅動）        |
| 稅率設定 | 各國分店稅率（🇹🇼 台灣 5% / 🇯🇵 日本 10% / 🇹🇭 泰國 7%），inline 編輯 |
| 財務報表 | 月營收走勢圖、收入費用明細（靜態 UI）                       |

#### 商品管理功能
- 分類篩選：全部分類 / 台式 / 南洋 / 西式 / 飲品
- 關鍵字搜尋：即時比對商品名稱
- 上下架 toggle：Signal 即時切換，庫存為 0 時自動顯示「缺貨」狀態
- Toast 通知：操作後顯示底部 Toast，含淡出動畫

#### 帳號管理
- **分店長子頁籤**：顯示 branch 欄位（台灣台北店 / 日本東京店 / 泰國曼谷店）
- **員工子頁籤**：顯示班別（早班 / 晚班 / 全天）
- 停用 / 恢復：Signal 即時切換，灰色文字 + 刪除線表示已停用

#### 稅率設定
- Inline 編輯：點擊「編輯」→ input 出現 → 輸入新稅率 → 儲存
- 儲存後 Toast 通知

#### 即時時鐘
- 頂部導覽列顯示 `YYYY/MM/DD 星期X HH:MM:SS`，每秒更新

---

## 共用服務說明

### AuthService（`src/app/shared/auth.service.ts`）
| 方法 | 說明 |
| ---- | ---- |
| `login(account, password)` | 客戶登入（Email 或手機號碼 + 密碼），成功回傳 `true` |
| `staffLogin(email, password)` | 管理人員登入，成功回傳 `MockUser`，失敗回傳 `null` |
| `loginAsGuest(phone)` | 訪客登入，建立 guest `MockUser` |
| `logout()` | 清除 `currentUser` 與 `sessionStorage` |
| `updateProfile(name, phone, password)` | 更新個人資料並同步 `sessionStorage` |
| `getOrders()` | 取得假訂單資料（未來替換為 HTTP API） |

> `currentUser` 初始化時從 `sessionStorage` 還原，頁面重整後不需重新登入。

### LoadingService（`src/app/shared/loading.service.ts`）
| 方法 | 觸發時機 | 風格 |
| ---- | -------- | ---- |
| `showStaffLoading()` | boss 登入成功 | 深海軍藍 + 金黃圓環 |
| `showPosLoading()` | branch_manager / staff 登入成功 | 深海軍藍 + 金黃圓環（副標題不同） |
| `showCustomerLoading()` | 點擊「切換到客戶入口」 | 奶油白底 + 橘紅彈跳 |
| `hide()` | 頁面導覽完成後 | — |

### OrderService（`src/app/shared/order.service.ts`）★ 新增
- 全域單例服務（`providedIn: 'root'`），以 Angular Signal 驅動
- 維護所有進行中訂單的 `LiveOrder[]`
- `addOrder(order)` — 新增訂單（客戶端送出 or POS 結帳時呼叫）
- `updateStatus(id, status)` — 更新訂單狀態（POS 看板操作時呼叫）
- `waiting / cooking / ready / done` — computed，依狀態分組供 POS 看板使用
- `latestCustomerOrder` — computed，取最新一筆來源為 `customer` 的訂單，供客戶追蹤頁使用
- `generateOrderNumber()` — 自動遞增，格式 `A-XXX`
- `generateOrderId()` — 格式 `LBB-YYYYMMDD-XXXX`

**跨元件即時同步流程：**
```
客戶端下單 (placeOrder)
  → OrderService.addOrder()
  → POS 訂單看板即時更新（waiting 欄新增）

POS 點擊「開始備餐」
  → OrderService.updateStatus(id, 'cooking')
  → 客戶端追蹤頁即時更新（status → cooking）
```

---

## 專案結構

```
src/
├── app/
│   ├── global_meals_login/
│   │   ├── staff-login/          # 管理系統登入（系統經理 M / 現場收銀員 S 兩分頁）
│   │   ├── customer-login/       # 客戶入口登入（Email 或手機號碼）
│   │   ├── customer-register/    # 客戶註冊頁面
│   │   └── customer-guest/       # 訪客快速點餐（僅需手機號碼）
│   ├── customer-home/            # 客戶主頁（5 頁籤 Shell）
│   ├── customer-member/          # 客戶會員中心（個人資料 + 訂單紀錄）
│   ├── manager-dashboard/        # 老闆管理後台（8 個功能頁籤）
│   ├── pos-terminal/             # 分店長 / 員工 POS 終端（6 個頁籤）
│   ├── shared/
│   │   ├── auth.service.ts       # 帳號驗證服務（Mock，含 sessionStorage 持久化）
│   │   ├── loading.service.ts    # 全域 Loading 狀態服務（3 種風格）
│   │   ├── order.service.ts      # 跨元件即時訂單狀態服務（Signal 驅動）★ 新增
│   │   ├── api.config.ts         # 後端 API 路徑設定（未來串接用）
│   │   ├── staff-loading/        # 管理端 Loading 動畫元件（深藍金）
│   │   └── customer-loading/     # 客戶端 Loading 動畫元件（橘紅暖色）
│   ├── app.component.*           # 根元件（含兩組 Loading 遮罩）
│   └── app.routes.ts             # 路由設定
├── index.html                    # 入口 HTML（字體 + Bootstrap + dotlottie-wc CDN）
└── styles.scss                   # 全域樣式

public/
└── assets/
    ├── Logo.png                  # 品牌 Logo（方形）
    ├── logo圓形.png              # 品牌 Logo（圓形，Loading 頁使用）
    ├── 招牌滷肉飯.jpg            # POS + 客戶菜單照片
    ├── 古早味排骨.jpg            # POS + 客戶菜單照片
    ├── 蚵仔麵線.jpg              # POS + 客戶菜單照片
    ├── 蚵仔煎.jpg                # POS + 客戶菜單照片
    ├── 三杯雞.jpg                # POS + 客戶菜單照片
    ├── 牛排.jpg                  # POS + 客戶菜單照片
    ├── 黑糖珍珠奶茶.jpg          # POS + 客戶菜單照片
    ├── 仙草奶茶.jpg              # POS + 客戶菜單照片
    ├── 阿三陽春麵.jpg            # 客戶今日優惠卡片照片
    └── （其他食物照片待上傳）
```

---

## 已完成功能

### 基礎架構
- [x] Angular 19 Standalone Components 架構
- [x] Angular Router 路由設定（8 個頁面）
- [x] 全域 Loading 遮罩（`app.component` 雙層遮罩 + `LoadingService` 控制）
- [x] sessionStorage 登入持久化（重整不需重新登入）
- [x] AuthService Mock 帳號驗證（5 種角色）

### 客戶端
- [x] 客戶登入 / 訪客登入（手機號碼）
- [x] 客戶註冊頁面 UI
- [x] 客戶主頁 5 頁籤 Shell（首頁 / 菜單 / 結帳 / 追蹤 / 訂單管理）
- [x] 首頁：主廚推薦 3 張真實食物照片卡片
- [x] 首頁：今日優惠 6 張橫向捲動卡片（真實食物照片 + 劃線原價 + 特價）
- [x] 菜單頁：分類篩選（飯食 / 麵食 / 小吃 / 輕食 / 飲品）+ 關鍵字搜尋
- [x] 購物車：加入 / 增減 / 移除 / 清空，觸覺回饋
- [x] 滿額贈品下拉（≥$300，含「不需要」選項，已選贈品顯示於品項列 $0）
- [x] 活動優惠兩層下拉（選活動 → 選該活動專屬贈品）
- [x] 折扣券：10 次累積可使用（維持在 10 次直到使用，使用後從 1 重算）
- [x] 訂單預覽 Modal（進入結帳前彈出確認視窗，可「上一步」修改）
- [x] 結帳頁：3 種付款方式選擇 + 備註欄
- [x] 完整下單流程（防重複 spinner → OrderService → 跳追蹤頁）
- [x] 付款頁「取消本次訂單，返回首頁」按鈕
- [x] 訂單即時追蹤（與 POS 看板狀態同步）
- [x] 個人資料抽屜（編輯姓名 / 手機 / 密碼 + sessionStorage 同步）
- [x] 折扣券紀錄側邊欄（每 10 次進度條 + 可使用 badge）
- [x] 訂單管理頁籤（已完成 / 已取消 / 已退款，下單後即時插入）
- [x] 訪客限制：隱藏「訂單管理」頁籤、禁止開啟個人資料抽屜
- [x] 菜單分類按鈕字體修正（移除斜體新細明體 fallback，改用 Noto Sans TC weight 500）
- [x] 已完成訂單「申請退款」按鈕（玫瑰紅線框膠囊，Hover 填色）
- [x] 退款申請 Modal（7 項原因複選 + 其他問題文字框 + 送出成功動畫）

### POS 終端
- [x] 分店長 / 員工雙角色登入（同一頁面，分頁切換）
- [x] 點餐 POS：9 種商品 + 分類篩選 + 搜尋
- [x] 商品卡：純文字精美餐飲按鈕（品名 + 價格 + `+`），無 SVG 圖示與 badge
- [x] 購物車：增減數量、小計、合計（無附加營業稅）
- [x] 會員查詢：支援 Email 或手機號碼（忽略 `-` 符號）；折扣券累積次數面板
- [x] 滿額贈品下拉（≥$300，已選贈品顯示於訂單列 $0，無 +/- 符號）
- [x] 活動優惠兩層下拉（選活動 → 選該活動專屬贈品）
- [x] 現金計算機 overlay（數字鍵盤 + 快速金額 + 找零計算）
- [x] 結帳 → 推送至 OrderService → 客戶追蹤即時同步
- [x] 即時時鐘（每秒更新）
- [x] 訂單看板：三欄分類（waiting / cooking / done）+ 狀態流轉按鈕
- [x] 庫存速查：分店長可 inline 調整庫存數量
- [x] 員工帳號管理（分店長專屬）：新增員工 Modal + 停/復權
- [x] 角色頁籤限制：員工隱藏「員工帳號」與「報表查詢」頁籤

### 老闆管理後台
- [x] boss 專屬登入保護
- [x] 8 個側邊欄頁籤
- [x] 即時時鐘
- [x] 商品管理：分類篩選 + 搜尋 + 上/下架 toggle
- [x] 活動管理：促銷啟用 / 停用 toggle
- [x] 庫存管理：低庫存警示 + inline 調整
- [x] 帳號管理：分店長 / 員工子頁籤 + 停/復權
- [x] 稅率設定：各國 inline 編輯
- [x] Toast 通知系統（操作回饋 + 淡出動畫）
- [x] 淺色主題（移除所有 inline 深色樣式）

### 設計系統
- [x] 設計代字（品牌字體套用）
- [x] 管理端主題：深海軍藍 × 金黃
- [x] 客戶端主題：暖橘奶油（活力橘紅 × 奶油白）
- [x] Bootstrap JS integrity hash 修正（ISSUE-001）

---

## 待辦事項

- [x] 老闆後台財務報表接真實資料（目前為假資料 UI）
- [x] 客戶端菜單商品卡補齊真實食物照片（目前部分仍用 CSS 漸層佔位）
- [x] POS 商品卡補齊真實食物照片
- [x] Angular Router 頁面轉場動畫
- [x] POS 訂單看板狀態持久化（目前頁面重整後重置）

---

## 變更紀錄（最近功能異動）

> 完整版本歷史請見 [CHANGELOG.md](./CHANGELOG.md)

### v0.4.0（2026-05-02）新增 / 修正
| 項目 | 說明 |
| ---- | ---- |
| 分店長 Dashboard 活動一覽 | 與老闆活動管理相同卡片樣式（封面圖、描述、日期、門檻）；移除新增/刪除按鈕，保留啟用/停用 toggle |
| POS 庫存扣減 | 結帳後自動呼叫 `POST /inventory/update` 扣減購物車商品庫存；手動調整庫存亦同步後端 |
| POS 活動贈品重構 | 移除前端硬編碼 `PROMO_ACTIVITIES`；改為即時呼叫 cart sync API 取得 `availablePromotions`，與客戶端一致 |
| POS 活動 UI 升級 | accordion 下拉展開贈品選項（客戶端同款）；未達門檻活動顯示進度條 +「再消費 NT$X 即可獲得贈品」提示 |
| POS 活動抽屜 | 優惠活動區塊可收合/展開；收合時顯示「已選：XXX 贈品」或「不參加」狀態 |
| POS 訪客結帳簡化 | 移除訪客模式手機號碼輸入欄；選訪客後可直接按結帳 |
| POS 會員未查詢攔截 | 選會員模式但未查詢到會員時按結帳，顯示 toast 警告阻止結帳 |
| POS 會員查詢修正 | 後端新增 `GET /members/get_by_phone` 端點；支援 `09XXXXXXXX` 本地格式自動轉 `+886XXXXXXXXX` |
| Debug 清理 | 移除 console.log、System.out.println、Hibernate TRACE logging |

### v0.2.7（2026-04-16）新增 / 修正
| 項目 | 說明 |
| ---- | ---- |
| 活動管理全面升級 | 活動 / 公告分類篩選 Tab（含計數 badge）；右側滑入新增面板含：類型選擇、描述、16:9 圖片上傳預覽、6 色 badge 選色器、日期區間（終止日啟用邏輯）、NT$ 最低消費欄位 |
| POS 訂單看板色條 | 三欄狀態各有清晰色條：等待備餐（灰）/ 備餐中（琥珀）/ 已完成（翠綠），border 5px + 背景色加深 |
| 登入頁角色識別 | 移除系統資訊列，改為「經理 / 分店長 / 員工」角色 badge 展示（含說明文字） |
| 客戶端新增活動專區 | 底部導覽列新增第 6 個頁籤「活動專區」，顯示佔位頁面（未來串接促銷 API） |
| 移除無作用按鈕 | 側邊欄「探索絕妙風味」promo card 移除 |
| 移除菜單新品標籤 | 仙草奶茶圖片上的「新品」overlay badge 移除 |
| 導覽重命名 | 客戶端「訂單管理」改為「我的訂單」（側邊欄 + 底部 nav 同步） |
| 編譯錯誤修正 | 修正 Angular 模板 `.filter(p => ...)` 箭頭函式錯誤；修正 API 回傳物件缺少 `type` 欄位的 TS2345 型別錯誤 |
| 移除密碼眼睛按鈕 | staff-login 與 customer-member 密碼欄位改為固定 `type="password"` |

### v0.2.0（2026-04-09）新增
| 項目 | 說明 |
| ---- | ---- |
| POS 商品卡重設計 | 移除 SVG 圖示與所有 badge 標籤，改為純文字精美餐飲按鈕（品名 + 價格 + `+`） |
| POS 現金計算機 | 選現金付款後跳出數字鍵盤 overlay，支援快速金額、找零計算，不足時 disabled |
| POS 會員查詢修正 | 手機號碼比對時忽略 `-`，`0912345678` 可比對到 `0912-345-678` |
| POS 移除營業稅 | 台灣無附加營業稅，移除 5% 稅金欄位 |
| POS 折扣券累積面板 | 會員面板改為訂單次數進度樣式（仿客戶端），10 次解鎖 8 折券 |
| 滿額贈品下拉（POS + 客戶端） | 移至購物車小計區，新增「不需要滿額免費贈品」選項，已選贈品顯示為 $0 品項列 |
| 活動優惠兩層下拉（POS + 客戶端） | 第一層選活動，第二層從該活動贈品清單挑選，三個活動各有獨立贈品選項 |
| 折扣券邏輯修正（POS + 客戶端） | 不使用折扣券時次數維持在 10，不再重置為 0 |
| 訂單預覽 Modal（客戶端） | 按「進入結帳頁面」先跳出確認視窗，可「上一步」修改或「確認建立訂單」前往付款 |
| 付款頁取消按鈕（客戶端） | 「返回」改為「取消本次訂單，返回首頁」，清空購物車並導回首頁 |
| `tsconfig.json` rootDir | 加入 `"rootDir": "./src"` 修正 TypeScript 輸出路徑警告 |
| 菜單分類按鈕字體修正 | 移除 `font-family: Fraunces + italic`（造成中文 fallback 新細明體斜體），改為 Noto Sans TC weight 500，`letter-spacing: 0.06em` |
| 訂單管理退款申請（客戶端） | 已完成訂單右下角新增玫瑰紅「申請退款」膠囊按鈕；點擊跳出 Modal，含 7 項原因複選、其他問題文字框、送出成功動畫 |

### v0.2.0 修改
| 項目 | 說明 |
| ---- | ---- |
| POS 購物車贈品列 | 已選贈品顯示於訂單品項底部，$0，無增減按鈕 |
| 客戶端折扣券次數上限 | `Math.min(count + 1, 10)` 確保不超過 10 次 |

### v0.1.0（2026-04-05）新增
| 項目 | 說明 |
| ---- | ---- |
| `OrderService` | 全新跨元件即時訂單服務，以 Signal 驅動，客戶下單 ↔ POS 看板雙向同步 |
| 客戶端完整下單流程 | 結帳頁 → 付款方式 → 送出（防重複）→ 推送 OrderService → 跳追蹤頁 |
| 客戶端訂單即時追蹤 | 透過 `OrderService.latestCustomerOrder` computed 即時同步 POS 狀態 |
| 客戶端訂單管理頁籤 | 已完成 / 已取消 / 已退款分頁，下單後即時插入 |
| 訪客限制邏輯 | 訪客隱藏「訂單管理」頁籤、禁止個人資料抽屜 |
| 累積消費進度條 | 側邊欄顯示累積訂單進度（每 10 筆折扣），`memberOrderCount` signal 驅動 |
| POS 分類篩選 + 搜尋 | 台式 / 西式 / 飲品 / 輕食分類，支援中英文名稱搜尋 |
| POS 滿額贈品提示 | 小計未達 $300 即顯示距離贈品差額提示 |
| POS 結帳成功動畫 | 結帳後顯示 SVG 打勾動畫 3 秒 |
| 真實食物照片（菜單） | 招牌滷肉飯、古早味排骨飯、蚵仔麵線、蚵仔煎、三杯雞、牛排、黑糖珍珠奶茶、仙草奶茶 |
| 今日優惠 6 張卡片照片 | 阿三陽春麵、蚵仔煎、黑糖珍珠奶茶、牛排、仙草奶茶、三杯雞（橫向捲動） |

### v0.1.0 修改
| 項目 | 說明 |
| ---- | ---- |
| `AuthService.updateProfile()` | 儲存後同步更新 `sessionStorage`，修正重整後資料回復的問題 |
| `AuthService` 初始化 | 從 `sessionStorage` 還原 `currentUser`，登入狀態在分頁關閉前持續有效 |
| 老闆後台主題 | 全面改為淺色主題，移除 inline 深色樣式 |
| Bootstrap JS | 修正 integrity hash 錯誤，解除瀏覽器 CORS 阻擋 |

---

## 團隊分支規範

```bash
# 開工前：同步最新 main
git checkout main && git pull origin main
git checkout dev-xxx && git merge main

# 收工後：推送並發 PR
git add .
git commit -m "描述"
git push origin dev-xxx
# → GitHub 發 Pull Request，等待隊長審核
```

---

> 文件最後更新：2026-04-16
