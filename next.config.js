/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Disable source maps in production — prevents reconstructing original source
  productionBrowserSourceMaps: false,

  // Powered-by header removal
  poweredByHeader: false,

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent embedding in iframes (clickjacking protection)
          { key: "X-Frame-Options", value: "DENY" },
          // XSS protection
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Referrer policy — don't leak full URL to third parties
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Permissions policy — disable unused browser APIs
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
      {
        // Protect API routes specifically
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
