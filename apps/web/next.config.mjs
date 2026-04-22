import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // `postgres` uses net.Socket + Buffer; webpack-bundling mangles its
  // internals and breaks jsonb writes with "Received an instance of Object".
  serverExternalPackages: ["postgres"],
};
export default nextConfig;
