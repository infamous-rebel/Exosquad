import { useEffect } from "react";

interface PageMetaProps {
  title: string;
  description?: string;
  noindex?: boolean;
  ogTitle?: string;
  ogDescription?: string;
  ogType?: string;
}

/**
 * Lightweight page meta manager — sets document.title, meta description,
 * robots, and Open Graph tags via useEffect. No external dependency.
 */
export function PageMeta({
  title,
  description,
  noindex = false,
  ogTitle,
  ogDescription,
  ogType = "website",
}: PageMetaProps) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = title;

    // Meta description
    const descTag =
      document.querySelector('meta[name="description"]') ??
      (() => {
        const el = document.createElement("meta");
        el.setAttribute("name", "description");
        document.head.appendChild(el);
        return el;
      })();
    const prevDesc = descTag.getAttribute("content") ?? "";
    if (description) {
      descTag.setAttribute("content", description);
    }

    // Robots
    const robotsTag =
      document.querySelector('meta[name="robots"]') ??
      (() => {
        const el = document.createElement("meta");
        el.setAttribute("name", "robots");
        document.head.appendChild(el);
        return el;
      })();
    const prevRobots = robotsTag.getAttribute("content") ?? "";
    robotsTag.setAttribute("content", noindex ? "noindex, nofollow" : "index, follow");

    // OG tags
    function setOG(prop: string, content: string | undefined) {
      if (!content) return;
      const tag =
        document.querySelector(`meta[property="${prop}"]`) ??
        (() => {
          const el = document.createElement("meta");
          el.setAttribute("property", prop);
          document.head.appendChild(el);
          return el;
        })();
      tag.setAttribute("content", content);
    }

    setOG("og:title", ogTitle ?? title);
    setOG("og:description", ogDescription ?? description);
    setOG("og:type", ogType);

    return () => {
      document.title = prevTitle;
      descTag.setAttribute("content", prevDesc);
      robotsTag.setAttribute("content", prevRobots);
    };
  }, [title, description, noindex, ogTitle, ogDescription, ogType]);

  return null;
}
