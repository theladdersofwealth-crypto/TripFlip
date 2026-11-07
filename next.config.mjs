/** @type {import('next').NextConfig} */
// 정적 내보내기: out/ 폴더를 Cloudflare Pages(무료, 상업적 이용 가능)에 올린다.
const nextConfig = { reactStrictMode: true, output: "export", images: { unoptimized: true } };
export default nextConfig;
