/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // ESLint is not part of the runtime dependency set; linting is run
  // separately, not during production builds. This prevents Render's clean
  // install from failing the build with "ESLint must be installed".
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
