/** @type {import('next').NextConfig} */
const nextConfig = {
  // Naver browser automation is a local-only Node runtime dependency.
  // Keep it external so Turbopack does not try to resolve it while building
  // the ATLAS UI. The automation layer installs playwright-core on first use
  // when it is not present, then loads it at runtime.
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
