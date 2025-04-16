/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3001/api/:path*'
      }
    ];
  },
  // Modify webpack configuration to use IgnorePlugin
  webpack: (config, { isServer, webpack }) => {
    // Exclude canvas using IgnorePlugin for both server and client
    // This prevents Webpack from trying to bundle the native module.
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /canvas/, // Ignore any require/import of 'canvas'
      })
    );

    // Important: return the modified config
    return config;
  },
  // Allow loading PDF files from our API endpoints
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/api/documents/**',
      },
    ],
  }
};

module.exports = nextConfig; 