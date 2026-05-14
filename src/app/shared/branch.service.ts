import { Injectable, inject, signal, computed } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ApiService, GlobalAreaVO } from './api.service';

export type CountryCode = 'TW' | 'JP' | 'KR';

export interface BranchOption {
  id: number;
  name: string;
}

export interface CountryConfig {
  code: CountryCode;
  name: string;
  nameLocal: string;
  currency: string;
  primaryColor: string;
  hoverColor: string;
  bgColor: string;
  fontFamily: string;
  discountLimit: number;
  dialCode: string;
}

export interface LangDict {
  /* ── Navigation / Header ── */
  managementSystem: string;
  customerEntrance: string;
  tagline: string;
  /* ── Login ── */
  welcome: string;
  loginTitle: string;
  loginSubtitle: string;
  accountLabel: string;
  accountPlaceholder: string;
  passwordLabel: string;
  passwordPlaceholder: string;
  loginBtn: string;
  registerBtn: string;
  divider: string;
  guestBtn: string;
  loginError: string;
  /* ── QR Code ── */
  qrTitle: string;
  qrSubtitle: string;
  /* ── Register ── */
  joinUs: string;
  registerTitle: string;
  registerSubtitle: string;
  requiredHint: string;
  nameLbl: string;
  namePlaceholder: string;
  nameError: string;
  phoneLbl: string;
  phonePlaceholder: string;
  passwordLbl: string;
  passwordPlaceholder2: string;
  passwordError: string;
  confirmPasswordLbl: string;
  confirmPlaceholder: string;
  confirmError: string;
  registerSubmit: string;
  hasAccount: string;
  backToLogin: string;
  /* ── Customer Home nav ── */
  navHome: string;
  navMenu: string;
  navCart: string;
  navTracker: string;
  navOrders: string;
  navPromos: string;
  /* ── Menu categories ── */
  catAll: string;
  catChef: string;
  catRice: string;
  catNoodles: string;
  catSnacks: string;
  catLight: string;
  catDrinks: string;
  searchPlaceholder: string;
  /* ── Cart / Checkout ── */
  addToCart: string;
  cartEmpty: string;
  subtotal: string;
  total: string;
  cash: string;
  creditCard: string;
  mobilePay: string;
  checkout: string;
  cancelOrder: string;
  note: string;
  notePlaceholder: string;
  /* ── Order tracker ── */
  orderTrackerTitle: string;
  waiting: string;
  cooking: string;
  ready: string;
  /* ── Password visibility ── */
  showPwd: string;
  hidePwd: string;
  /* ── User identity ── */
  guestLabel: string;
  memberLabel: string;
  notLoggedIn: string;
  noName: string;
  /* ── Sidebar profile ── */
  profileTitle: string;
  emailLbl: string;
  emailPlaceholder: string;
  oldPwdPlaceholder: string;
  newPwdPlaceholder: string;
  confirmNewPwdPlaceholder: string;
  couponTitle: string;
  couponReady: string;
  couponAccum: string;
  couponOrderedPre: string;
  couponOrdTimes: string;
  couponEarnedSuffix: string;
  couponProgressMid: string;
  couponProgressSuffix: string;
  saveProfile: string;
  editProfile: string;
  navDivider: string;
  footerTagline: string;
  loginAsMember: string;
  logout: string;
  /* ── Home carousel ── */
  heroSlide1Tag: string;
  heroSlide1Desc: string;
  orderNow: string;
  limitedOffer: string;
  heroSlide2Title: string;
  heroSlide2DescPre: string;
  heroSlide2DescGift: string;
  todayPick: string;
  chefRec: string;
  emailNotSet: string;
  viewMenu: string;
  goOrder: string;
  goFeatured: string; /* ── Home sections ── */
  limitedTimeOffer: string;
  todayDeals: string;
  dealDisclaimer: string;
  /* ── Checkout page ── */
  checkoutTitle: string;
  orderDetail: string;
  itemCountSuffix: string;
  free: string;
  couponDiscount: string;
  clearCart: string;
  couponBlockTitle: string;
  couponActive: string;
  couponAvailable: string;
  couponCancel: string;
  couponUse: string;
  selectFreeItem: string;
  selectPromoFirst: string;
  /* ── Order preview modal ── */
  previewTitle: string;
  previewHint: string;
  goBack: string;
  confirmOrder: string;
  /* ── Payment page ── */
  cancelOrderReturn: string;
  paymentTitle: string;
  paymentMethodLbl: string;
  contactPhone: string;
  required: string;
  guestPhonePlaceholder: string;
  memberPhonePlaceholder: string;
  phoneRequired: string;
  cardNumberLbl: string;
  cardExpiryLbl: string;
  cardCvvLbl: string;
  cardHolderLbl: string;
  cardIncomplete: string;
  mobilePayDesc: string;
  qrExpiry: string;
  mobilePayHint: string;
  processing: string;
  /* ── Tracker ── */
  pickupNumber: string;
  estimatedWait: string;
  minutes: string;
  noActiveOrder: string;
  /* ── Orders history ── */
  orderHistoryTitle: string;
  orderHistoryCountPre: string;
  orderHistoryCountPost: string;
  statusCompleted: string;
  statusCancelled: string;
  statusRefunded: string;
  noCompletedOrders: string;
  noCancelledOrders: string;
  noRefundedOrders: string;
  goOrderSomething: string;
  totalLabel: string;
  requestRefund: string;
  /* ── Promotions ── */
  promoTagNew: string;
  promoTagPromo: string;
  promoTagPremium: string;
  /* ── Promo Banner / Drawer ── */
  promoGiftPrefix: string;
  promoInProgressTitle: string;
  promoAchievedPre: string;
  promoCountUnit: string;
  promoTotalPre: string;
  promoExpandHint: string;
  promoBadgeDone: string;
  promoDoneTag: string;
  promoRemainPre: string;
  promoCanSelectGift: string;
  /* ── Checkout Promo Gift Panel ── */
  giftSelectedPre: string;
  giftChangeLbl: string;
  /* ── Checkout Promo Activity List ── */
  skipPromo: string;
  selectThisPromo: string;
  promoMinSpendPre: string;
  /* ── Promo Zone / Detail ── */
  promoZoneTitle: string;
  promoSpendPre: string;
  promoSpendPost: string;
  promoJoinPost: string;
  viewDetails: string;
  activityDesc: string;
  availableGifts: string;
  goOrderNow: string;
  /* ── Mobile Pay Modal ── */
  payAmount: string;
  confirmPayment: string;
  cancel: string;
  /* ── Loading Screen ── */
  loadingTagline: string;
  loadingWait: string;
  /* ── Refund Modal ── */
  refundTitle: string;
  refundSubtitle: string;
  refundOtherLabel: string;
  refundOtherPlaceholder: string;
  refundCancelBtn: string;
  refundSubmitBtn: string;
  refundSuccessTitle: string;
  refundSuccessSub: string;
  refundR1: string;
  refundR2: string;
  refundR3: string;
  refundR4: string;
  refundR5: string;
  refundR6: string;
  refundR7: string;
  /* ── Hero Slide chef item ── */
  heroChefItemName: string;
  heroChefPricePre: string;
  /* ── Session expired ── */
  sessionExpiredTitle: string;
  sessionExpiredDesc: string;
  sessionExpiredBtn: string;
  /* ── Guest login page ── */
  guestOrderBadge: string;
  guestPageTitle: string;
  guestPageSubtitle: string;
  guestLoginPhonePlaceholder: string;
  guestPhoneInputError: string;
  guestEnterBtn: string;
}

const TW: LangDict = {
  managementSystem: '管理系統',
  customerEntrance: '客戶入口',
  tagline: '懶懶吃，飽飽樂',
  welcome: '歡迎回來',
  loginTitle: '會員登入，開始美味旅程',
  loginSubtitle: '登入享有個人化推薦、集點與專屬優惠',
  accountLabel: '手機號碼 / 電子郵件',
  accountPlaceholder: '請輸入手機或電子郵件',
  passwordLabel: '密碼',
  passwordPlaceholder: '請輸入密碼',
  loginBtn: '會員登入',
  registerBtn: '前往註冊，享受美食',
  divider: '或者',
  guestBtn: '訪客快速點餐，免登入',
  loginError: '✗ 帳號或密碼錯誤，請再試一次',
  qrTitle: '掃碼現場點餐',
  qrSubtitle: '掃描 QR Code 立即開始點餐',
  joinUs: '✦ 加入我們',
  registerTitle: '建立帳號，享受美食旅程',
  registerSubtitle: '註冊後可享有個人化推薦、集點與專屬優惠',
  requiredHint: '* 以下欄位均為必填',
  nameLbl: '會員名稱',
  namePlaceholder: '請輸入您的名稱',
  nameError: '✗ 請輸入會員名稱',
  phoneLbl: '手機號碼',
  phonePlaceholder: '請輸入電話號碼（含區碼）',
  passwordLbl: '密碼',
  passwordPlaceholder2: '請設定密碼（至少 6 位）',
  passwordError: '✗ 密碼至少需要 6 個字元',
  confirmPasswordLbl: '確認密碼',
  confirmPlaceholder: '請再次輸入密碼',
  confirmError: '✗ 兩次輸入的密碼不一致',
  registerSubmit: '立即註冊，開始點餐',
  hasAccount: '已有帳號？',
  backToLogin: '返回登入',
  navHome: '首頁',
  navMenu: '菜單',
  navCart: '購物車',
  navTracker: '訂單追蹤',
  navOrders: '我的訂單',
  navPromos: '活動專區',
  catAll: '全部',
  catChef: '主廚推薦',
  catRice: '飯食',
  catNoodles: '麵食',
  catSnacks: '小吃',
  catLight: '輕食',
  catDrinks: '飲品',
  searchPlaceholder: '搜尋餐點名稱…',
  addToCart: '加入購物車',
  cartEmpty: '購物車是空的',
  subtotal: '小計',
  total: '合計',
  cash: '現金',
  creditCard: '信用卡',
  mobilePay: '行動支付',
  checkout: '前往結帳',
  cancelOrder: '取消訂單',
  note: '備註',
  notePlaceholder: '特殊要求、口味偏好…',
  orderTrackerTitle: '訂單追蹤',
  waiting: '等待中',
  cooking: '製作中',
  ready: '可取餐',
  showPwd: '顯示密碼',
  hidePwd: '隱藏密碼',
  guestLabel: '訪客',
  memberLabel: '會員',
  notLoggedIn: '未登入',
  noName: '無名氏',
  profileTitle: '個人資料',
  emailLbl: '電子郵件',
  emailPlaceholder: '輸入Email',
  oldPwdPlaceholder: '請輸入舊密碼',
  newPwdPlaceholder: '輸入新密碼',
  confirmNewPwdPlaceholder: '再次輸入新密碼',
  couponTitle: '兌換券紀錄',
  couponReady: '可使用',
  couponAccum: '累積中',
  couponOrderedPre: '已點餐',
  couponOrdTimes: '次',
  couponEarnedSuffix: '，您獲得了折扣兌換券 !! 請於購物車結帳時使用。',
  couponProgressMid: '次，差',
  couponProgressSuffix: '次即可獲得折扣兌換券。',
  saveProfile: '儲存資料',
  editProfile: '修改資料',
  navDivider: '導覽功能',
  footerTagline: '✦ 懶懶吃，飽飽樂 ✦',
  loginAsMember: '返回登入頁面',
  logout: '登出帳號',
  heroSlide1Tag: '✦ 全球風味 • 一掌點餐 ✦',
  heroSlide1Desc: '懶懶吃，飽飽樂 — 探索各地絕妙風味',
  orderNow: '立即點餐 →',
  limitedOffer: '🎁 期間限定',
  heroSlide2Title: '滿額送好禮',
  heroSlide2DescPre: '消費滿 ',
  heroSlide2DescGift: '贈招牌滷蛋 × 2',
  emailNotSet: '（未設定）',
  todayPick: '今日精選',
  chefRec: '本週主廚推薦',
  viewMenu: '查看菜單',
  goOrder: '前往點餐',
  goFeatured: '前往',
  limitedTimeOffer: '限時特惠',
  todayDeals: '今日優惠',
  dealDisclaimer: '優惠價僅供參考，以實際菜單結帳為準',
  checkoutTitle: '確認訂單',
  orderDetail: '訂單明細',
  itemCountSuffix: '件',
  free: '免費',
  couponDiscount: '折扣券折抵最多200',
  clearCart: '清空購物車',
  couponBlockTitle: '折扣兌換券',
  couponActive: '已選擇使用，本次享 9 折優惠',
  couponAvailable: '您有 1 張折扣券，是否在本次訂單使用？',
  couponCancel: '取消使用',
  couponUse: '使用折扣券',
  selectFreeItem: '按此選擇免費餐點',
  selectPromoFirst: '請先於下方選擇活動',
  previewTitle: '確認訂單預覽',
  previewHint: '請確認品項是否正確，如有問題可按「上一步」修改',
  goBack: '← 上一步',
  confirmOrder: '確認建立訂單',
  cancelOrderReturn: '取消本次訂單，返回首頁',
  paymentTitle: '付款頁面',
  paymentMethodLbl: '付款方式',
  contactPhone: '聯絡電話',
  required: '必填',
  guestPhonePlaceholder: '請輸入電話號碼（訪客必填）',
  memberPhonePlaceholder: '確認聯絡電話',
  phoneRequired: '請填入電話號碼後才能送出訂單',
  cardNumberLbl: '卡號',
  cardExpiryLbl: '有效期限',
  cardCvvLbl: '安全碼 CVV',
  cardHolderLbl: '持卡人姓名（英文大寫）',
  cardIncomplete: '請確認卡片資料均填寫完整',
  mobilePayDesc: '請使用手機掃描以下 QR Code 完成付款',
  qrExpiry: '此 QR Code 可用手機掃描 · 請在 5 分鐘內掃碼',
  mobilePayHint: '請掃描上方 QR Code，在手機上完成付款',
  processing: '處理中...',
  pickupNumber: '您的取餐號碼',
  estimatedWait: '預估等候',
  minutes: '分鐘',
  noActiveOrder: '目前沒有進行中的訂單',
  orderHistoryTitle: '訂單紀錄',
  orderHistoryCountPre: '共',
  orderHistoryCountPost: '筆歷史訂單',
  statusCompleted: '已完成',
  statusCancelled: '已取消',
  statusRefunded: '已退款',
  noCompletedOrders: '目前沒有已完成的訂單',
  noCancelledOrders: '目前沒有已取消的訂單',
  noRefundedOrders: '目前沒有已退款的訂單',
  goOrderSomething: '去點些美食吧！',
  totalLabel: '合　計',
  requestRefund: '申請退款',
  promoTagNew: '新會員限定',
  promoTagPromo: '期間限定',
  promoTagPremium: '限時豪禮',
  promoGiftPrefix: '即贈 ',
  promoInProgressTitle: '進行中活動',
  promoAchievedPre: '已達成',
  promoCountUnit: '個活動',
  promoTotalPre: '共',
  promoExpandHint: '，展開查看進度',
  promoBadgeDone: '個達成',
  promoDoneTag: '達成！點此選贈品',
  promoRemainPre: '差',
  promoCanSelectGift: '可至結帳頁選取贈品',
  giftSelectedPre: '已選：',
  giftChangeLbl: '點此更換免費餐點',
  skipPromo: '不參加活動優惠',
  selectThisPromo: '按此選擇此活動，點選免費贈品。',
  promoMinSpendPre: '滿 ',
  promoZoneTitle: '活動專區',
  promoSpendPre: '消費滿 ',
  promoSpendPost: ' 可選贈品',
  promoJoinPost: ' 即可參加',
  viewDetails: '查看詳情 →',
  activityDesc: '活動說明',
  availableGifts: '可選贈品',
  goOrderNow: '立即前往點餐',
  payAmount: '付款金額',
  confirmPayment: '確認付款',
  cancel: '取消',
  loadingTagline: '✦ 懶懶吃，飽飽樂 ✦',
  loadingWait: '請稍候 · PLEASE WAIT',
  refundTitle: '申請退款',
  refundSubtitle: '請選擇退款原因（可複選）',
  refundOtherLabel: '其他問題',
  refundOtherPlaceholder: '請描述您遇到的問題（選填）…',
  refundCancelBtn: '取消申請退款',
  refundSubmitBtn: '送出申請退款',
  refundSuccessTitle: '申請已送出',
  refundSuccessSub: '我們將盡快為您處理退款，請稍候。',
  refundR1: '餐點品項錯誤（與訂單內容不符）',
  refundR2: '食物有異物或異味',
  refundR3: '食物未熟透或過度烹調',
  refundR4: '份量明顯不足',
  refundR5: '餐點送達時已嚴重冷卻',
  refundR6: '包裝破損，影響食品衛生',
  refundR7: '含有過敏原且未事先告知',
  sessionExpiredTitle: '登入已過期',
  sessionExpiredDesc: '您的登入狀態已逾時，請重新登入後繼續操作。',
  heroChefItemName: '日式烤雞串',
  heroChefPricePre: '只要 ',
  sessionExpiredBtn: '重新登入',
  guestOrderBadge: '訪客點餐',
  guestPageTitle: '快速點餐，免帳號登入',
  guestPageSubtitle: '輸入手機號碼即可立即進入點餐，不需要註冊',
  guestLoginPhonePlaceholder: '請輸入手機號碼（至少 8 碼）',
  guestPhoneInputError: '⚠ 請輸入正確的手機號碼（至少 8 碼）',
  guestEnterBtn: '進入點餐',
};

const JP: LangDict = {
  managementSystem: '管理システム',
  customerEntrance: 'お客様入口',
  tagline: 'ゆっくり食べて、満腹の幸せ',
  welcome: 'いらっしゃいませ',
  loginTitle: '会員ログイン・美味しい旅を始めましょう',
  loginSubtitle:
    'ログインで個人化されたおすすめ・ポイント・特典をお楽しみください',
  accountLabel: '電話番号・メールアドレス',
  accountPlaceholder: '電話番号またはメールアドレスを入力',
  passwordLabel: 'パスワード',
  passwordPlaceholder: 'パスワードを入力してください',
  loginBtn: 'ログイン',
  registerBtn: '会員登録して美食を楽しむ',
  divider: 'または',
  guestBtn: 'ゲスト注文（ログイン不要）',
  loginError: '✗ アカウントまたはパスワードが違います。もう一度お試しください',
  qrTitle: 'QRコードで注文',
  qrSubtitle: 'スキャンして今すぐ注文',
  joinUs: '✦ ご参加ください',
  registerTitle: 'アカウントを作成して美食を楽しもう',
  registerSubtitle:
    '登録で個人化されたおすすめ・ポイント・特典をお楽しみください',
  requiredHint: '* 以下のフィールドはすべて必須です',
  nameLbl: '会員名',
  namePlaceholder: 'お名前を入力してください',
  nameError: '✗ 会員名を入力してください',
  phoneLbl: '電話番号',
  phonePlaceholder: '例：090-XXXX-XXXX',
  passwordLbl: 'パスワード',
  passwordPlaceholder2: 'パスワードを設定してください（6文字以上）',
  passwordError: '✗ パスワードは6文字以上必要です',
  confirmPasswordLbl: 'パスワード（確認）',
  confirmPlaceholder: 'パスワードをもう一度入力してください',
  confirmError: '✗ パスワードが一致しません',
  registerSubmit: '今すぐ登録して注文する',
  hasAccount: 'アカウントをお持ちですか？',
  backToLogin: 'ログインに戻る',
  navHome: 'ホーム',
  navMenu: 'メニュー',
  navCart: 'カート',
  navTracker: '注文追跡',
  navOrders: '注文履歴',
  navPromos: 'キャンペーン',
  catAll: 'すべて',
  catChef: 'シェフのおすすめ',
  catRice: 'ご飯料理',
  catNoodles: '麺料理',
  catSnacks: '軽食',
  catLight: 'ライト',
  catDrinks: 'ドリンク',
  searchPlaceholder: '料理名を検索…',
  addToCart: 'カートに追加',
  cartEmpty: 'カートは空です',
  subtotal: '小計',
  total: '合計',
  cash: '現金',
  creditCard: 'クレジットカード',
  mobilePay: '電子決済',
  checkout: '注文する',
  cancelOrder: '注文をキャンセル',
  note: '備考',
  notePlaceholder: '特別なご要望・味のご希望…',
  orderTrackerTitle: '注文追跡',
  waiting: '準備中',
  cooking: '調理中',
  ready: 'お受け取り可能',
  showPwd: 'パスワードを表示',
  hidePwd: 'パスワードを非表示',
  guestLabel: 'ゲスト',
  memberLabel: '会員',
  notLoggedIn: '未ログイン',
  noName: '名無し',
  profileTitle: '個人情報',
  emailLbl: 'メールアドレス',
  emailPlaceholder: 'メールアドレスを入力',
  oldPwdPlaceholder: '現在のパスワードを入力',
  newPwdPlaceholder: '新しいパスワードを入力',
  confirmNewPwdPlaceholder: '新しいパスワードをもう一度入力',
  couponTitle: 'クーポン記録',
  couponReady: '利用可能',
  couponAccum: '積立中',
  couponOrderedPre: 'ご注文',
  couponOrdTimes: '回',
  couponEarnedSuffix:
    '回達成！割引クーポンを獲得しました。決済時にご利用ください。',
  couponProgressMid: '回注文で、残り',
  couponProgressSuffix: '回でクーポン獲得！',
  saveProfile: '保存する',
  editProfile: '編集する',
  navDivider: 'ナビゲーション',
  footerTagline: '✦ ゆっくり食べて、満腹の幸せ ✦',
  loginAsMember: '会員でログインして注文する',
  logout: 'ログアウト',
  heroSlide1Tag: '✦ 世界の味 • 指一本で注文 ✦',
  heroSlide1Desc: 'ゆっくり食べて、満腹の幸せ — 世界の味を探索',
  orderNow: '今すぐ注文 →',
  limitedOffer: '🎁 期間限定',
  heroSlide2Title: '満額プレゼント',
  heroSlide2DescPre: '',
  heroSlide2DescGift: '特製煮卵 × 2 プレゼント',
  emailNotSet: '（未設定）',
  todayPick: '本日のおすすめ',
  chefRec: '今週のシェフのおすすめ',
  viewMenu: 'メニューを見る',
  goOrder: '注文へ',
  goFeatured: '進む',
  limitedTimeOffer: '期間限定特価',
  todayDeals: '今日のお得',
  dealDisclaimer: '優待価格は参考のみ、実際の価格はメニューに準じます。',
  checkoutTitle: '注文確認',
  orderDetail: '注文内容',
  itemCountSuffix: '件',
  free: '無料',
  couponDiscount: 'クーポン割引（最大200円）',
  clearCart: 'カートをクリア',
  couponBlockTitle: '割引クーポン',
  couponActive: '割引クーポン使用中（10%オフ）',
  couponAvailable: '割引クーポンが1枚あります。今回の注文で使用しますか？',
  couponCancel: '使用をキャンセル',
  couponUse: 'クーポンを使用',
  selectFreeItem: '無料メニューを選ぶ',
  selectPromoFirst: '下からキャンペーンを選んでください',
  previewTitle: '注文プレビュー確認',
  previewHint: '内容をご確認ください。変更は「戻る」を押してください',
  goBack: '← 戻る',
  confirmOrder: '注文を確定する',
  cancelOrderReturn: '注文をキャンセルしてホームへ戻る',
  paymentTitle: '支払い画面',
  paymentMethodLbl: 'お支払い方法',
  contactPhone: '連絡先電話番号',
  required: '必須',
  guestPhonePlaceholder: '電話番号を入力してください（ゲスト必須）',
  memberPhonePlaceholder: '連絡先電話番号を確認',
  phoneRequired: '電話番号を入力してから注文を送信してください',
  cardNumberLbl: 'カード番号',
  cardExpiryLbl: '有効期限',
  cardCvvLbl: 'セキュリティコード CVV',
  cardHolderLbl: 'カード名義（大文字）',
  cardIncomplete: 'カード情報をすべて正確に入力してください',
  mobilePayDesc:
    'スマートフォンで以下のQRコードをスキャンして支払いを完了してください',
  qrExpiry:
    'このQRコードはスマートフォンでスキャン · 5分以内にスキャンしてください',
  mobilePayHint:
    '上のQRコードをスキャンして、スマートフォンで支払いを完了してください',
  processing: '処理中...',
  pickupNumber: 'お受け取り番号',
  estimatedWait: '推定待ち時間',
  minutes: '分',
  noActiveOrder: '現在進行中の注文はありません',
  orderHistoryTitle: '注文履歴',
  orderHistoryCountPre: '全',
  orderHistoryCountPost: '件の注文履歴',
  statusCompleted: '完了',
  statusCancelled: 'キャンセル済み',
  statusRefunded: '返金済み',
  noCompletedOrders: '完了した注文はありません',
  noCancelledOrders: 'キャンセルした注文はありません',
  noRefundedOrders: '返金済みの注文はありません',
  goOrderSomething: 'お食事を注文しましょう！',
  totalLabel: '合計',
  requestRefund: '返金申請',
  promoTagNew: '新会員限定',
  promoTagPromo: '期間限定',
  promoTagPremium: '期間限定ギフト',
  promoGiftPrefix: '特典：',
  promoInProgressTitle: '進行中キャンペーン',
  promoAchievedPre: '達成済み',
  promoCountUnit: '件',
  promoTotalPre: '全',
  promoExpandHint: '件、展開して確認',
  promoBadgeDone: '件達成',
  promoDoneTag: '達成！特典を選ぶ',
  promoRemainPre: 'あと',
  promoCanSelectGift: '会計ページで特典を選択してください',
  giftSelectedPre: '選択済：',
  giftChangeLbl: '無料メニューを変更する',
  skipPromo: 'キャンペーン不参加',
  selectThisPromo: 'このキャンペーンを選択して無料特典を選んでください。',
  promoMinSpendPre: '',
  promoZoneTitle: 'キャンペーン',
  promoSpendPre: '',
  promoSpendPost: '以上で特典',
  promoJoinPost: '以上で参加可能',
  viewDetails: '詳細を見る →',
  activityDesc: 'キャンペーン説明',
  availableGifts: '選べる特典',
  goOrderNow: '今すぐ注文する',
  payAmount: '支払金額',
  confirmPayment: '支払確認',
  cancel: 'キャンセル',
  loadingTagline: '✦ のんびり食べて、お腹いっぱい ✦',
  loadingWait: 'しばらくお待ちください · PLEASE WAIT',
  refundTitle: '返金申請',
  refundSubtitle: '返金理由を選択してください（複数可）',
  refundOtherLabel: 'その他の問題',
  refundOtherPlaceholder: 'ご状況をご記入ください（任意）…',
  refundCancelBtn: '申請をキャンセル',
  refundSubmitBtn: '返金を申請する',
  refundSuccessTitle: '申請が送信されました',
  refundSuccessSub: 'できる限り早く対応いたします。しばらくお待ちください。',
  refundR1: '注文内容と異なる商品が届いた',
  refundR2: '食品に異物・異臭があった',
  refundR3: '食品が生焼け・過度に加熱されていた',
  refundR4: '量が明らかに不足していた',
  refundR5: '届いた時点で食品が著しく冷めていた',
  refundR6: '包装が破損し衛生上問題がある',
  refundR7: 'アレルゲンが事前に告知されていなかった',
  sessionExpiredTitle: 'セッションが期限切れ',
  sessionExpiredDesc:
    'セッションの有効期限が切れました。再度ログインしてください。',
  heroChefItemName: '日本風チキン串焼き',
  heroChefPricePre: '',
  sessionExpiredBtn: '再ログイン',
  guestOrderBadge: 'ゲスト注文',
  guestPageTitle: 'ゲスト注文・アカウント不要',
  guestPageSubtitle: '電話番号を入力するだけで注文できます。登録不要。',
  guestLoginPhonePlaceholder: '電話番号を入力してください（8桁以上）',
  guestPhoneInputError: '⚠ 正しい電話番号を入力してください（8桁以上）',
  guestEnterBtn: '注文へ進む',
};

const KR: LangDict = {
  managementSystem: '관리 시스템',
  customerEntrance: '고객 입구',
  tagline: '느긋하게 먹고, 배부르게 즐겨요',
  welcome: '어서 오세요',
  loginTitle: '회원 로그인・맛있는 여행을 시작해요',
  loginSubtitle:
    '로그인하면 맞춤 추천, 포인트 및 특별 혜택을 이용할 수 있습니다',
  accountLabel: '전화번호・이메일',
  accountPlaceholder: '전화번호 또는 이메일 입력',
  passwordLabel: '비밀번호',
  passwordPlaceholder: '비밀번호를 입력하세요',
  loginBtn: '로그인',
  registerBtn: '회원가입 후 맛있는 음식을 즐겨요',
  divider: '또는',
  guestBtn: '게스트 주문（로그인 불필요）',
  loginError: '✗ 계정 또는 비밀번호가 잘못되었습니다. 다시 시도해 주세요',
  qrTitle: 'QR코드로 주문',
  qrSubtitle: '스캔하여 바로 주문하세요',
  joinUs: '✦ 가입하기',
  registerTitle: '계정을 만들고 맛있는 음식을 즐겨요',
  registerSubtitle:
    '등록하면 맞춤 추천, 포인트 및 특별 혜택을 이용할 수 있습니다',
  requiredHint: '* 아래 항목은 모두 필수입니다',
  nameLbl: '회원 이름',
  namePlaceholder: '이름을 입력하세요',
  nameError: '✗ 회원 이름을 입력하세요',
  phoneLbl: '전화번호',
  phonePlaceholder: '예：010-XXXX-XXXX',
  passwordLbl: '비밀번호',
  passwordPlaceholder2: '비밀번호를 설정하세요（6자 이상）',
  passwordError: '✗ 비밀번호는 6자 이상이어야 합니다',
  confirmPasswordLbl: '비밀번호 확인',
  confirmPlaceholder: '비밀번호를 다시 입력하세요',
  confirmError: '✗ 비밀번호가 일치하지 않습니다',
  registerSubmit: '지금 가입하고 주문하세요',
  hasAccount: '이미 계정이 있으신가요？',
  backToLogin: '로그인으로 돌아가기',
  navHome: '홈',
  navMenu: '메뉴',
  navCart: '장바구니',
  navTracker: '주문 추적',
  navOrders: '내 주문',
  navPromos: '이벤트',
  catAll: '전체',
  catChef: '셰프 추천',
  catRice: '밥 요리',
  catNoodles: '면류',
  catSnacks: '간식',
  catLight: '라이트',
  catDrinks: '음료',
  searchPlaceholder: '메뉴 이름 검색…',
  addToCart: '장바구니에 추가',
  cartEmpty: '장바구니가 비어있습니다',
  subtotal: '소계',
  total: '합계',
  cash: '현금',
  creditCard: '신용카드',
  mobilePay: '모바일 결제',
  checkout: '주문하기',
  cancelOrder: '주문 취소',
  note: '메모',
  notePlaceholder: '특별 요청, 맛 선호도…',
  orderTrackerTitle: '주문 추적',
  waiting: '대기 중',
  cooking: '조리 중',
  ready: '수령 가능',
  showPwd: '비밀번호 표시',
  hidePwd: '비밀번호 숨기기',
  guestLabel: '게스트',
  memberLabel: '회원',
  notLoggedIn: '미로그인',
  noName: '이름 없음',
  profileTitle: '내 정보',
  emailLbl: '이메일',
  emailPlaceholder: '이메일 입력',
  oldPwdPlaceholder: '현재 비밀번호 입력',
  newPwdPlaceholder: '새 비밀번호 입력',
  confirmNewPwdPlaceholder: '새 비밀번호 다시 입력',
  couponTitle: '쿠폰 기록',
  couponReady: '사용 가능',
  couponAccum: '적립 중',
  couponOrderedPre: '주문 횟수',
  couponOrdTimes: '번',
  couponEarnedSuffix: '번 달성! 할인 쿠폰을 받았습니다. 결제 시 사용하세요。',
  couponProgressMid: '번 주문했으며，남은',
  couponProgressSuffix: '번 더 하면 쿠폰을 받을 수 있습니다。',
  saveProfile: '저장',
  editProfile: '수정',
  navDivider: '탐색 기능',
  footerTagline: '✦ 느긋하게 먹고, 배부르게 즐겨요 ✦',
  loginAsMember: '회원으로 로그인하여 주문하기',
  logout: '로그아웃',
  heroSlide1Tag: '✦ 세계의 맛 • 한 손으로 주문 ✦',
  heroSlide1Desc: '느긋하게 먹고, 배부르게 — 세계 각지의 맛을 탐험',
  orderNow: '지금 주문하기 →',
  limitedOffer: '🎁 기간 한정',
  heroSlide2Title: '일정 금액 이상 주문 시 선물',
  heroSlide2DescPre: '',
  heroSlide2DescGift: '특제 조림달걀 × 2 증정',
  emailNotSet: '（미설정）',
  todayPick: '오늘의 엄선',
  chefRec: '이번 주 셰프 추천',
  viewMenu: '메뉴 보기',
  goOrder: '주문하러 가기',
  goFeatured: '이동',
  limitedTimeOffer: '한시 특가',
  todayDeals: '오늘의 특가',
  dealDisclaimer: '할인가는 참고용이며 실제 결제 금액은 메뉴 기준입니다.',
  checkoutTitle: '주문 확인',
  orderDetail: '주문 내역',
  itemCountSuffix: '건',
  free: '무료',
  couponDiscount: '쿠폰 할인 (최대 200원)',
  clearCart: '장바구니 비우기',
  couponBlockTitle: '할인 쿠폰',
  couponActive: '할인 쿠폰 사용 중 (10% 할인)',
  couponAvailable: '할인 쿠폰 1장이 있습니다. 이번 주문에 사용하시겠습니까？',
  couponCancel: '사용 취소',
  couponUse: '쿠폰 사용',
  selectFreeItem: '무료 메뉴 선택하기',
  selectPromoFirst: '아래에서 먼저 이벤트를 선택하세요',
  previewTitle: '주문 미리보기 확인',
  previewHint: '내용을 확인하세요. 수정하려면 「이전」을 누르세요',
  goBack: '← 이전',
  confirmOrder: '주문 확정',
  cancelOrderReturn: '주문 취소 후 홈으로 돌아가기',
  paymentTitle: '결제 화면',
  paymentMethodLbl: '결제 수단',
  contactPhone: '연락처 전화번호',
  required: '필수',
  guestPhonePlaceholder: '전화번호를 입력하세요（게스트 필수）',
  memberPhonePlaceholder: '연락처 전화번호 확인',
  phoneRequired: '전화번호를 입력해야 주문을 제출할 수 있습니다',
  cardNumberLbl: '카드 번호',
  cardExpiryLbl: '유효기간',
  cardCvvLbl: '보안코드 CVV',
  cardHolderLbl: '카드 소유자 이름（대문자）',
  cardIncomplete: '카드 정보를 모두 입력해 주세요',
  mobilePayDesc: '휴대폰으로 아래 QR 코드를 스캔하여 결제를 완료하세요',
  qrExpiry: '이 QR 코드는 5분 이내에 스캔해 주세요',
  mobilePayHint: '위의 QR 코드를 스캔하여 휴대폰에서 결제를 완료하세요',
  processing: '처리 중...',
  pickupNumber: '수령 번호',
  estimatedWait: '예상 대기',
  minutes: '분',
  noActiveOrder: '진행 중인 주문이 없습니다',
  orderHistoryTitle: '주문 내역',
  orderHistoryCountPre: '총',
  orderHistoryCountPost: '건의 주문 내역',
  statusCompleted: '완료',
  statusCancelled: '취소됨',
  statusRefunded: '환불됨',
  noCompletedOrders: '완료된 주문이 없습니다',
  noCancelledOrders: '취소된 주문이 없습니다',
  noRefundedOrders: '환불된 주문이 없습니다',
  goOrderSomething: '음식을 주문해 보세요！',
  totalLabel: '합계',
  requestRefund: '환불 신청',
  promoTagNew: '신규 회원 전용',
  promoTagPromo: '기간 한정',
  promoTagPremium: '기간 한정 선물',
  promoGiftPrefix: '증정: ',
  promoInProgressTitle: '진행 중 이벤트',
  promoAchievedPre: '달성',
  promoCountUnit: '개 이벤트',
  promoTotalPre: '총',
  promoExpandHint: ', 펼쳐서 진행 상황 확인',
  promoBadgeDone: '개 달성',
  promoDoneTag: '달성! 사은품 선택',
  promoRemainPre: '남은 금액',
  promoCanSelectGift: '결제 페이지에서 사은품 선택',
  giftSelectedPre: '선택됨：',
  giftChangeLbl: '무료 메뉴 변경하기',
  skipPromo: '이벤트 미참여',
  selectThisPromo: '이 이벤트를 선택하고 무료 사은품을 고르세요。',
  promoMinSpendPre: '',
  promoZoneTitle: '이벤트 존',
  promoSpendPre: '',
  promoSpendPost: ' 이상 구매 시 사은품',
  promoJoinPost: ' 이상 구매 시 참여 가능',
  viewDetails: '자세히 보기 →',
  activityDesc: '이벤트 설명',
  availableGifts: '선택 가능한 사은품',
  goOrderNow: '지금 주문하기',
  payAmount: '결제 금액',
  confirmPayment: '결제 확인',
  cancel: '취소',
  loadingTagline: '✦ 느긋하게 먹고, 배불리 즐겨요 ✦',
  loadingWait: '잠시 기다려주세요 · PLEASE WAIT',
  refundTitle: '환불 신청',
  refundSubtitle: '환불 사유를 선택해 주세요（복수 선택 가능）',
  refundOtherLabel: '기타 문제',
  refundOtherPlaceholder: '문제를 설명해 주세요（선택 사항）…',
  refundCancelBtn: '환불 신청 취소',
  refundSubmitBtn: '환불 신청 제출',
  refundSuccessTitle: '신청이 접수되었습니다',
  refundSuccessSub: '최대한 빠르게 처리해 드리겠습니다. 잠시 기다려주세요。',
  refundR1: '주문 내용과 다른 상품이 도착했습니다',
  refundR2: '음식에 이물질 또는 이취가 있었습니다',
  refundR3: '음식이 설익거나 과도하게 조리되었습니다',
  refundR4: '양이 명백히 부족했습니다',
  refundR5: '도착 시 음식이 심하게 식어 있었습니다',
  refundR6: '포장이 파손되어 위생상 문제가 있습니다',
  refundR7: '알레르기 유발 성분이 사전에 고지되지 않았습니다',
  sessionExpiredTitle: '로그인이 만료됨',
  sessionExpiredDesc: '로그인 상태가 만료되었습니다. 다시 로그인해 주세요。',
  heroChefItemName: '일본식 닭꼬치',
  heroChefPricePre: '',
  sessionExpiredBtn: '다시 로그인',
  guestOrderBadge: '게스트 주문',
  guestPageTitle: '빠른 주문・계정 없이 이용 가능',
  guestPageSubtitle:
    '전화번호만 입력하면 바로 주문할 수 있습니다. 가입 불필요.',
  guestLoginPhonePlaceholder: '전화번호를 입력하세요（8자리 이상）',
  guestPhoneInputError: '⚠ 올바른 전화번호를 입력하세요（8자리 이상）',
  guestEnterBtn: '주문으로 이동',
};

const TRANSLATIONS: Record<CountryCode, LangDict> = { TW, JP, KR };

export const COUNTRY_CONFIGS: Record<CountryCode, CountryConfig> = {
  TW: {
    code: 'TW',
    name: '台灣',
    nameLocal: '台灣',
    currency: 'NT$',
    primaryColor: '#D95C1A',
    hoverColor: '#A84210',
    bgColor: '#FFFAF3',
    fontFamily: "'Noto Sans TC', sans-serif",
    discountLimit: 200,
    dialCode: '+886',
  },
  JP: {
    code: 'JP',
    name: '日本',
    nameLocal: '日本',
    currency: '¥',
    primaryColor: '#B5451A',
    hoverColor: '#8C3212',
    bgColor: '#FAF7F2',
    fontFamily: "'Noto Sans JP', 'Noto Sans TC', sans-serif",
    discountLimit: 1000,
    dialCode: '+81',
  },
  KR: {
    code: 'KR',
    name: '韓國',
    nameLocal: '한국',
    currency: '₩',
    primaryColor: '#D94F2B',
    hoverColor: '#B03A1C',
    bgColor: '#FFF8F5',
    fontFamily: "'Noto Sans KR', 'Noto Sans TC', sans-serif",
    discountLimit: 10000,
    dialCode: '+82',
  },
};

@Injectable({ providedIn: 'root' })
export class BranchService {
  private doc = inject(DOCUMENT);
  private apiService = inject(ApiService);
  private _regionsMap = signal<Record<string, number>>({});
  private _branches = signal<GlobalAreaVO[]>([]);

  private _c = signal<CountryCode>(
    (() => {
      try {
        const s = localStorage.getItem('selectedCountry');
        return s === 'TW' || s === 'JP' || s === 'KR'
          ? (s as CountryCode)
          : 'TW';
      } catch {
        return 'TW';
      }
    })(),
  );

  private _globalAreaId = signal<number>(
    (() => {
      try {
        const saved = localStorage.getItem('selectedBranch');
        return saved ? Number(saved) : 19;
      } catch {
        return 19;
      }
    })(),
  );

  readonly lang = computed(() => TRANSLATIONS[this._c()]);

  /** 依目前國家的 regionsId 篩選分店，並回傳 { id, name } 清單 */
  readonly localizedBranches = computed(() => {
    const regId = this._regionsMap()[this._c()];
    if (!regId) return [];
    return this._branches()
      .filter(b => b.regionsId === regId)
      .map(b => ({ id: b.id, name: b.branch }));
  });

  get country(): CountryCode {
    return this._c();
  }
  /** 當前國家對應的 regions.id（後端 @Min(1) 驗證，0 表示尚未載入） */
  get regionsId(): number {
    return this._regionsMap()[this._c()] ?? 0;
  }
  get config(): CountryConfig {
    return COUNTRY_CONFIGS[this._c()];
  }
  get allCountries(): CountryConfig[] {
    return Object.values(COUNTRY_CONFIGS);
  }
  get globalAreaId(): number {
    return this._globalAreaId();
  }
  get currentBranches(): BranchOption[] {
    return this.localizedBranches();
  }

  setGlobalAreaId(id: number): void {
    this._globalAreaId.set(id);
    try { localStorage.setItem('selectedBranch', String(id)); } catch {}
  }

  getLocalizedBranchName(branch: BranchOption): string {
    return branch.name;
  }

  setCountry(code: CountryCode): void {
    this._c.set(code);
    const regId = this._regionsMap()[code];
    const branches = regId
      ? this._branches().filter(b => b.regionsId === regId)
      : [];
    const firstId = branches.length > 0 ? branches[0].id : 19;
    this._globalAreaId.set(firstId);
    try {
      localStorage.setItem('selectedCountry', code);
      localStorage.setItem('selectedBranch', String(firstId));
    } catch {}
    this.applyTheme(code);
  }

  applyTheme(code: CountryCode): void {
    const cfg = COUNTRY_CONFIGS[code];
    const root = this.doc.documentElement;
    root.style.setProperty('--brand-primary', cfg.primaryColor);
    root.style.setProperty('--brand-hover', cfg.hoverColor);
    root.style.setProperty('--brand-bg', cfg.bgColor);
    root.style.setProperty('--brand-currency', cfg.currency);
    root.style.setProperty('--brand-font', cfg.fontFamily);
    this.doc.body.style.fontFamily = cfg.fontFamily;
  }

  init(): void {
    this.applyTheme(this._c());
    if (Object.keys(this._regionsMap()).length === 0) {
      this.apiService.getAllTax().subscribe({
        next: res => {
          if (res.code === 200 && res.regionsList) {
            const map: Record<string, number> = {};
            res.regionsList.forEach(r => { map[r.countryCode] = r.id; });
            this._regionsMap.set(map);
          }
        },
        error: () => {},
      });
    }
    if (this._branches().length === 0) {
      this.apiService.getAllBranches().subscribe({
        next: res => {
          if (res.code === 200 && res.globalAreaList?.length) {
            this._branches.set(res.globalAreaList);
          }
        },
        error: () => {},
      });
    }
  }
}
