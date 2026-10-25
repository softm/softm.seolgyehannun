import { useEffect, useRef, useState } from "react";
import { adFitConfig, selectAdFitPlacement } from "../adfitConfig";

const NATIVE_AD_WEBVIEW = /\bAdMobNative\/\d+\b/;
const AD_TIMEOUT_MS = 30_000;

declare global {
  interface Window {
    seolgyehannunAdFitFailed?: (ad: HTMLElement) => void;
    seolgyehannunAdFitLoaded?: (ad: HTMLElement) => void;
  }
}

export function AdFitBanner() {
  const hostRef = useRef<HTMLDivElement>(null);
  const requestedRef = useRef(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !adFitConfig.enabled || NATIVE_AD_WEBVIEW.test(navigator.userAgent)) {
      setVisible(false);
      return;
    }

    let timeoutId = 0;
    let startId = 0;
    let observer: IntersectionObserver | null = null;
    let currentAd: HTMLElement | null = null;
    let disposed = false;

    const hide = () => {
      window.clearTimeout(timeoutId);
      if (!disposed) setVisible(false);
      host.replaceChildren();
    };

    const load = () => {
      if (disposed || requestedRef.current || document.hidden) return;
      const placement = selectAdFitPlacement(host.clientWidth);
      if (!placement) {
        hide();
        return;
      }

      requestedRef.current = true;
      currentAd = document.createElement("ins");
      currentAd.className = "kakao_ad_area";
      currentAd.style.display = "none";
      currentAd.dataset.adUnit = placement.unit;
      currentAd.dataset.adWidth = String(placement.width);
      currentAd.dataset.adHeight = String(placement.height);
      currentAd.dataset.adOnfail = "seolgyehannunAdFitFailed";
      currentAd.dataset.adOnload = "seolgyehannunAdFitLoaded";
      host.appendChild(currentAd);

      const script = document.createElement("script");
      script.async = true;
      script.charset = "utf-8";
      script.src = adFitConfig.script;
      script.onerror = hide;
      script.onload = () => {
        timeoutId = window.setTimeout(() => {
          if (!host.querySelector("iframe")) hide();
        }, AD_TIMEOUT_MS);
      };
      document.head.appendChild(script);
    };

    window.seolgyehannunAdFitFailed = (ad) => {
      if (ad === currentAd) hide();
    };
    window.seolgyehannunAdFitLoaded = (ad) => {
      if (ad !== currentAd) return;
      window.clearTimeout(timeoutId);
    };

    // Deferring one task prevents React StrictMode's development probe from requesting twice.
    startId = window.setTimeout(() => {
      if (!("IntersectionObserver" in window)) {
        load();
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer?.disconnect();
        load();
      }, { rootMargin: "200px 0px" });
      observer.observe(host);
    }, 0);

    return () => {
      disposed = true;
      observer?.disconnect();
      window.clearTimeout(startId);
      window.clearTimeout(timeoutId);
      if (window.seolgyehannunAdFitFailed) delete window.seolgyehannunAdFitFailed;
      if (window.seolgyehannunAdFitLoaded) delete window.seolgyehannunAdFitLoaded;
      currentAd?.remove();
    };
  }, []);

  if (!visible) return null;

  return (
    <aside className="landing-adfit" aria-label="광고">
      <span className="landing-adfit-label">광고</span>
      <div ref={hostRef} className="landing-adfit-host" />
    </aside>
  );
}
