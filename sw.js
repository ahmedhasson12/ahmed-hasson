/* سجل المناوبات — عامل الخدمة (Service Worker)
   يخزّن ملفات التطبيق ليعمل كاملاً بدون إنترنت. */

const VERSION = "shift-attendance-v24";
const CORE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

// التثبيت: خزّن ملفات التطبيق الأساسية
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(CORE.map((url) => cache.add(url).catch(() => {})));
    self.skipWaiting();
  })());
});

// التفعيل: احذف النسخ القديمة من الذاكرة المؤقتة
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// الجلب: الصفحة من الشبكة أولاً مع رجوع للمخزَّن، وبقية الملفات من المخزَّن أولاً
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // طلبات المزامنة لا تُخزَّن أبداً، وإلا عادت نتائج قديمة بدل الحيّة
  if (url.pathname.includes("/rest/v1/") || url.pathname.includes("/auth/v1/")) return;

  const sameOrigin = url.origin === self.location.origin;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match("./index.html");
        return cached || new Response("التطبيق غير متاح حالياً.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }

  // الخطوط وملفات التطبيق: من المخزَّن أولاً ثم الشبكة مع تخزين النسخة
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && (fresh.ok || fresh.type === "opaque")) {
        const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
        const isLib = url.hostname === "cdnjs.cloudflare.com";
        if (sameOrigin || isFont || isLib) {
          const cache = await caches.open(VERSION);
          cache.put(req, fresh.clone());
        }
      }
      return fresh;
    } catch (e) {
      return cached || Response.error();
    }
  })());
});
