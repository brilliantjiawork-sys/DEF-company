// ==========================================
// DEF Company 配置文件：隐私同意 (Consent Mode v2) + 链接
// ⚠️ 这个文件必须在 index.html 里放在 GTM 代码【之前】加载，
//    否则 GTM 会在"默认同意状态"设置之前就读取状态，数据会出问题。
// ==========================================

// 1. 初始化 dataLayer 与 gtag（必须 push arguments，不能 push 普通数组）
window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }

// 2. 同意状态的存储设置
const CONSENT_KEY  = 'def_cookie_consent_v1';   // localStorage 里的名字
const CONSENT_DAYS = 180;                        // 选择保留 180 天后重新询问

// 把用户的两类选择，翻译成 Google 的四个同意信号
//   分析 (analytics)  -> analytics_storage                       （GA4 完整追踪只需要这一项）
//   营销 (marketing)  -> ad_storage / ad_user_data / ad_personalization （广告相关）
function consentToGtag(choice) {
  const a = choice.analytics ? 'granted' : 'denied';
  const m = choice.marketing ? 'granted' : 'denied';
  return {
    analytics_storage: a,
    ad_storage: m,
    ad_user_data: m,
    ad_personalization: m
  };
}

// 读取之前保存的选择（过期、损坏、隐私模式下读不到，都当作"没选过"）
function readConsent() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
    if (!saved || typeof saved.savedAt !== 'number') return null;
    if (Date.now() - saved.savedAt > CONSENT_DAYS * 86400000) return null;
    return saved;
  } catch (e) {
    return null;
  }
}

// 3. 默认：全部拒绝（在 GTM 加载前执行）
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'analytics_storage': 'denied',
  'wait_for_update': 500
});

// 4. 老访客：立刻恢复他上次的选择（同样必须在 GTM 加载前）
const savedConsent = readConsent();
if (savedConsent) {
  gtag('consent', 'update', consentToGtag(savedConsent));
}

// 5. 站点配置
const SITE_CONFIG = {
    // 你的 GTM 容器 ID
    gtmId: "GTM-P6HXR6VF",

    // Newsletter 订阅后端网址
    newsletterUrl: "https://script.google.com/macros/s/AKfycbyp_mZTaWd45pMcH3uJybalRtjH-_RHKPq8uczUZDB6sW8F6d2zC2AeycTTeMl8Fy1B/exec",

    // Contact Sales 后端网址
    contactUrl: "https://script.google.com/macros/s/AKfycbwVTwhQ0VPIHJ8gIrwCHk7JdO9ExUnl4YLfGloypMEzsIc-0HY4___BpuX_Ef_bj4MqNQ/exec"
};
