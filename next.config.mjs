/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "ws", "bufferutil", "utf-8-validate"],
};
export default nextConfig;
