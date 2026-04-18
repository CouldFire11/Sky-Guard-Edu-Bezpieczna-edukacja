/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Zezwalaj na obrazki z lokalnego serwera FastAPI
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  // Konfiguracja API proxy na czas developmentu
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/:path*',
      },
      {
        // Stream wideo — proxy przez Next.js (brak CORS)
        source: '/stream/:path*',
        destination: 'http://localhost:8000/stream/:path*',
      },
      {
        // Incydenty bezpośrednio
        source: '/incidents/:path*',
        destination: 'http://localhost:8000/incidents/:path*',
      },
      {
        source: '/drone/:path*',
        destination: 'http://localhost:8000/drone/:path*',
      },
    ]
  },
}

module.exports = nextConfig
