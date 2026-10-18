// Metro, Expo's bundler. The defaults plus what expo-sqlite needs to run in a web browser (for previewing on the PC):
// its database engine is a .wasm file, and the page must be cross-origin isolated to use it.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
