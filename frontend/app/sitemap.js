const siteUrl = "https://news.gautamenterprises.org";

const publicRoutes = [
  { path: "/", priority: 0.8 },
  { path: "/contact-us", priority: 1 },
  { path: "/grievance-redressal", priority: 0.7 },
  { path: "/privacy-policy", priority: 0.6 },
  { path: "/terms-and-conditions", priority: 0.6 },
  { path: "/news-table", priority: 0.5 },
];

export default function sitemap() {
  const now = new Date();

  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.path === "/contact-us" ? "monthly" : "daily",
    priority: route.priority,
  }));
}
