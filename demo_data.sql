-- ============================================================
-- Global Meals Demo Data Script
-- 執行前請確認 branch_id / regions_id 與你的 DB 實際值一致
-- branch_id:  1=台灣台北店  2=日本東京店  3=泰國曼谷店  4=韓國首爾店
-- regions_id: 1=台灣       2=日本        3=泰國         4=韓國
-- ============================================================

-- 關閉 Workbench 安全更新模式（避免 Error 1175）
SET SQL_SAFE_UPDATES = 0;

-- ------------------------------------------------------------
-- 1. 韓國分店（global_area）：若尚未有 id=4 請執行
-- ------------------------------------------------------------
INSERT IGNORE INTO global_area (id, country, branch, address, phone, regions_id)
VALUES (4, '韓國', '韓國首爾店', '서울특별시 강남구 테헤란로 152', '+82-2-3456-7890', 4);

-- ------------------------------------------------------------
-- 2. 韓國稅率（regions）：刪除重複，只留一筆
--    若 id=4 的韓國已存在，把多餘的刪掉
-- ------------------------------------------------------------
-- 先確認重複：SELECT * FROM regions WHERE country = '韓國';
-- 刪除 id 較大的重複筆（根據實際查詢結果調整 id）：
-- DELETE FROM regions WHERE country = '韓國' AND id != (SELECT MIN(id) FROM (SELECT id FROM regions WHERE country='韓國') t);

-- 補上 usage_cap（折扣上限）與 country_code：
UPDATE regions SET usage_cap = 3, country_code = 'KR' WHERE country = '韓國';
UPDATE regions SET usage_cap = 5, country_code = 'TW' WHERE country = '台灣';
UPDATE regions SET usage_cap = 4, country_code = 'JP' WHERE country = '日本';
UPDATE regions SET usage_cap = 3, country_code = 'TH' WHERE country = '泰國';

-- ------------------------------------------------------------
-- 3. 財務報表假資料（2025-11 ~ 2026-04）
--    共 6 個月 × 4 個分店 = 24 筆
--    金額參考：台灣~NT$120k/月, 日本~¥580k/月, 泰國~฿280k/月, 韓國~₩9,800k/月
-- ------------------------------------------------------------

-- 3-0. 確保 monthly_financial_reports 有 regions_id 欄位
--      ⚠ 若報錯「Duplicate column name」代表欄位已存在，略過此行即可
ALTER TABLE monthly_financial_reports
  ADD COLUMN regions_id INT NOT NULL DEFAULT 0;

DELETE FROM monthly_financial_reports WHERE id BETWEEN 1 AND 100;

INSERT INTO monthly_financial_reports (id, report_date, branch_id, regions_id, total_amount) VALUES
-- 2025-11
(1,  '2025-11', 1, 1,  112500.00),
(2,  '2025-11', 2, 2,  542000.00),
(3,  '2025-11', 3, 3,  268000.00),
(4,  '2025-11', 4, 4, 9250000.00),
-- 2025-12
(5,  '2025-12', 1, 1,  138000.00),
(6,  '2025-12', 2, 2,  618000.00),
(7,  '2025-12', 3, 3,  312000.00),
(8,  '2025-12', 4, 4,11200000.00),
-- 2026-01
(9,  '2026-01', 1, 1,  152000.00),
(10, '2026-01', 2, 2,  596000.00),
(11, '2026-01', 3, 3,  285000.00),
(12, '2026-01', 4, 4, 9850000.00),
-- 2026-02
(13, '2026-02', 1, 1,  128500.00),
(14, '2026-02', 2, 2,  561000.00),
(15, '2026-02', 3, 3,  274000.00),
(16, '2026-02', 4, 4, 9420000.00),
-- 2026-03
(17, '2026-03', 1, 1,  145000.00),
(18, '2026-03', 2, 2,  605000.00),
(19, '2026-03', 3, 3,  298000.00),
(20, '2026-03', 4, 4,10350000.00),
-- 2026-04（截至 4/30，示範月）
(21, '2026-04', 1, 1,  132000.00),
(22, '2026-04', 2, 2,  578000.00),
(23, '2026-04', 3, 3,  291000.00),
(24, '2026-04', 4, 4, 9780000.00);

-- ------------------------------------------------------------
-- 4. 韓國分店長帳號（staff）
--    role = REGION_MANAGER，global_area_id = 4
--    密碼請用系統加密後替換，這裡先放明文供測試
-- ------------------------------------------------------------
INSERT IGNORE INTO staff (name, account, password, role, global_area_id, is_status)
VALUES
  ('김민준', 'km.rm.kr', 'password123', 'REGION_MANAGER', 4, 1),
  ('박서연', 'ps.rm.kr', 'password123', 'REGION_MANAGER', 4, 1);

-- ------------------------------------------------------------
-- 5. 韓國分店位址修正（test → 正式地址）
-- ------------------------------------------------------------
UPDATE global_area
SET address = '서울특별시 강남구 테헤란로 152',
    phone   = '+82-2-3456-7890'
WHERE country = '韓國';

-- ============================================================
-- 6. promotions 表：加入分店篩選欄位與多語系活動名稱
-- ============================================================

-- 6-1. 為 promotions 加入三個新欄位
--      ⚠ 若報錯「Duplicate column name」代表欄位已存在，略過此段即可
ALTER TABLE promotions
  ADD COLUMN global_area_id INT          NULL DEFAULT NULL COMMENT 'NULL=全球活動; 有值=分店專屬',
  ADD COLUMN name_jp        VARCHAR(255) NULL DEFAULT NULL COMMENT '日文活動名稱',
  ADD COLUMN name_kr        VARCHAR(255) NULL DEFAULT NULL COMMENT '韓文活動名稱';

-- 6-2. 全球活動（3 筆，老闆建立，global_area_id = NULL，所有分店可見）
--      若已有相同名稱的活動請先確認 id，避免重複插入
DELETE FROM promotions_gifts WHERE promotions_id IN
  (SELECT id FROM promotions WHERE name IN ('新會員首單禮','週末滿額禮','消費達人大禮包'));
DELETE FROM promotions WHERE name IN ('新會員首單禮','週末滿額禮','消費達人大禮包');

INSERT INTO promotions (name, name_jp, name_kr, start_time, end_time, is_active, global_area_id,
  description) VALUES
('新會員首單禮',
 '新規会員様限定・初回ご注文特典',
 '신규 회원 한정！첫 주문 웰컴 혜택',
 '2026-04-01', '2026-06-30', 1, NULL,
 '首次下單的新會員，消費滿 $150 即享贈品，歡迎加入懶飽飽！'),
('週末滿額禮',
 '週末限定！お買い上げプレゼント',
 '주말 한정！구매 금액 달성 혜택',
 '2026-04-05', '2026-05-31', 1, NULL,
 '每逢週末消費滿 $300，三款贈品任選一，週週有驚喜！'),
('消費達人大禮包',
 'グルメ達人限定！特大ダブルギフトセット',
 '소비 달인 한정！더블 대형 선물 세트',
 '2026-04-01', '2026-04-30', 1, NULL,
 '單筆消費滿 $500，立享豪華雙重組合贈品，本月限定！');

-- 取得剛插入的 promotions id（根據實際 AUTO_INCREMENT 值，請先 SELECT 確認再 INSERT 贈品）
-- INSERT INTO promotions_gifts 範例（假設 id 分別為 10, 11, 12，請依實際查詢結果調整）:
-- INSERT INTO promotions_gifts (promotions_id, full_amount, quantity, gift_product_id, is_active)
-- VALUES (10, 150, -1, 7, 1), (10, 150, -1, 9, 1),
--        (11, 300, -1, 8, 1), (11, 300, -1, 6, 1),
--        (12, 500, -1, 9, 1), (12, 500, -1, 3, 1);

-- 6-3. 日本東京店專屬活動（3 筆，global_area_id = 2）
DELETE FROM promotions_gifts WHERE promotions_id IN
  (SELECT id FROM promotions WHERE global_area_id = 2);
DELETE FROM promotions WHERE global_area_id = 2;

INSERT INTO promotions (name, name_jp, name_kr, start_time, end_time, is_active, global_area_id,
  description) VALUES
('桜フェア限定セット',
 '桜フェア限定セット',
 '벚꽃 페어 한정 세트',
 '2026-04-01', '2026-04-30', 1, 2,
 '春の桜シーズン限定！¥2,000以上のご購入で特製桜スイーツを1個プレゼント。'),
('抹茶スイーツプレゼント',
 '抹茶スイーツプレゼント',
 '말차 스위츠 증정',
 '2026-04-10', '2026-05-31', 1, 2,
 '¥1,500以上のご購入で、濃厚抹茶プリンを1個プレゼント！期間限定の贅沢な一品。'),
('週末ファミリー割引',
 '週末ファミリー割引',
 '주말 패밀리 할인',
 '2026-04-05', '2026-06-30', 1, 2,
 '毎週末¥3,000以上のご購入でドリンク2杯無料！ご家族皆さまで懶飽飽をお楽しみください。');

-- 6-4. 韓國首爾店專屬活動（3 筆，global_area_id = 4）
DELETE FROM promotions_gifts WHERE promotions_id IN
  (SELECT id FROM promotions WHERE global_area_id = 4);
DELETE FROM promotions WHERE global_area_id = 4;

INSERT INTO promotions (name, name_jp, name_kr, start_time, end_time, is_active, global_area_id,
  description) VALUES
('봄맞이 환영 이벤트',
 '春の歓迎イベント',
 '봄맞이 환영 이벤트',
 '2026-04-01', '2026-04-30', 1, 4,
 '봄을 맞아 신규 방문 고객께 ₩8,000 이상 구매 시 뚝배기 된장찌개 미니 1개를 증정합니다！'),
('한식 특선 세트',
 '韓国料理特選セット',
 '한식 특선 세트',
 '2026-04-10', '2026-05-31', 1, 4,
 '₩15,000 이상 구매 시 정성껏 준비한 한식 반찬 세트를 선물로 드립니다！전통의 맛을 집에서도 즐기세요。'),
('주말 가족 특가',
 '週末ファミリー特価',
 '주말 가족 특가',
 '2026-04-05', '2026-06-30', 1, 4,
 '매주 주말 ₩20,000 이상 구매 시 음료 2잔을 무료로 드립니다！온 가족이 懶飽飽에서 즐거운 주말을 보내세요。');

-- ============================================================
-- 執行完後請重啟 Spring Boot 讓 Hibernate 重新讀取
-- ============================================================

-- 恢復安全更新模式
SET SQL_SAFE_UPDATES = 1;
