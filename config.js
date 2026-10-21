// ==========================================
// 🌟 DEF Company 专属配置文件：链接与隐私底线
// ==========================================

// 1. 初始化 DataLayer 与 gtag
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}

// 2. 默认隐私拦截 (在 GTM 加载前执行，完全符合最严格的合规要求)
// 删除了读取 localStorage 的逻辑，保证每次都处于默认拒绝状态
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'analytics_storage': 'denied',
  'wait_for_update': 500 // 稍微等待，确保右下角弹窗完美加载
});

const SITE_CONFIG = {
    // 你的 GTM 容器 ID
    gtmId: "GTM-P6HXR6VF", 
    
    // Newsletter 订阅后端网址
    newsletterUrl: "https://script.google.com/macros/s/AKfycbyp_mZTaWd45pMcH3uJybalRtjH-_RHKPq8uczUZDB6sW8F6d2zC2AeycTTeMl8Fy1B/exec",
    
    // Contact Sales 后端网址
    contactUrl: "https://script.google.com/macros/s/AKfycbwVTwhQ0VPIHJ8gIrwCHk7JdO9ExUnl4YLfGloypMEzsIc-0HY4___BpuX_Ef_bj4MqNQ/exec"
};