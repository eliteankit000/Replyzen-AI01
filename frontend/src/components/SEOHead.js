import { useEffect } from "react";

/**
 * SEOHead - Lightweight per-page SEO without any extra dependencies.
 * Updates document.title and meta tags dynamically for each route.
 * Works with React CRA + React Router (no react-helmet needed).
 */
export default function SEOHead({
  title,
  description,
  keywords,
  canonical,
  ogTitle,
  ogDescription,
  ogUrl,
  noIndex = false,
}) {
  const siteName = "ReplyZen AI";
  const fullTitle = title ? `${title} | ${siteName}` : `${siteName} – AI Follow-Up & Email Automation Tool`;
  const metaDescription = description || "ReplyZen AI detects silent email conversations and generates intelligent follow-up emails automatically. Never miss a follow-up again.";
  const metaKeywords = keywords || "ReplyZen AI, AI follow-up tool, email automation AI, Gmail follow-up automation";
  const canonicalUrl = canonical || "https://replyzenai.com/";

  useEffect(() => {
    // Title
    document.title = fullTitle;

    // Helper to set/create meta tag
    const setMeta = (selector, attr, value) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement("meta");
        const [attrName, attrVal] = attr.split("=");
        el.setAttribute(attrName, attrVal.replace(/"/g, ""));
        document.head.appendChild(el);
      }
      el.setAttribute("content", value);
    };

    // Helper for link tags
    const setLink = (rel, href) => {
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    // Standard meta
    setMeta('meta[name="description"]',    'name="description"',    metaDescription);
    setMeta('meta[name="keywords"]',       'name="keywords"',       metaKeywords);
    setMeta('meta[name="robots"]',         'name="robots"',         noIndex ? "noindex, nofollow" : "index, follow");

    // Open Graph
    setMeta('meta[property="og:title"]',       'property="og:title"',       ogTitle || fullTitle);
    setMeta('meta[property="og:description"]', 'property="og:description"]', ogDescription || metaDescription);
    setMeta('meta[property="og:url"]',         'property="og:url"',         ogUrl || canonicalUrl);
    setMeta('meta[property="og:type"]',        'property="og:type"',        "website");
    setMeta('meta[property="og:site_name"]',   'property="og:site_name"',   siteName);

    // Twitter
    setMeta('meta[name="twitter:title"]',       'name="twitter:title"',       ogTitle || fullTitle);
    setMeta('meta[name="twitter:description"]', 'name="twitter:description"', ogDescription || metaDescription);
    setMeta('meta[name="twitter:card"]',        'name="twitter:card"',        "summary_large_image");

    // Canonical
    setLink("canonical", canonicalUrl);

    // Cleanup: restore defaults when component unmounts
    return () => {
      document.title = `${siteName} – AI Follow-Up & Email Automation Tool`;
    };
  }, [fullTitle, metaDescription, metaKeywords, canonicalUrl, noIndex, ogTitle, ogDescription, ogUrl]);

  return null; // renders nothing — pure side-effect component
}
