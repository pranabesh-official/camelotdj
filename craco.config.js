const path = require('path');
const webpack = require('webpack');
require('dotenv').config();

module.exports = {
    webpack: {
        configure: (webpackConfig) => {
            webpackConfig.target = 'web';

            // Webpack 4 vs 5 compatibility for Node polyfills
            const supportsFallback = webpackConfig.resolve && Object.prototype.hasOwnProperty.call(webpackConfig.resolve, 'fallback');

            if (supportsFallback) {
                // Webpack 5 style fallbacks
                webpackConfig.resolve.fallback = {
                    ...webpackConfig.resolve.fallback,
                    "process": require.resolve("process/browser"),
                    "util": require.resolve("util/"),
                    "stream": require.resolve("stream-browserify"),
                    "buffer": require.resolve("buffer/"),
                    "path": require.resolve("path-browserify"),
                    "fs": false,
                    "os": false,
                    "crypto": require.resolve("crypto-browserify")
                };
            } else {
                // Webpack 4: use alias + node field
                webpackConfig.resolve = webpackConfig.resolve || {};
                webpackConfig.resolve.alias = {
                    ...(webpackConfig.resolve.alias || {}),
                    "util": require.resolve("util/"),
                    "stream": require.resolve("stream-browserify"),
                    "buffer": require.resolve("buffer/"),
                    "path": require.resolve("path-browserify"),
                    "crypto": require.resolve("crypto-browserify")
                };
                webpackConfig.node = {
                    ...(webpackConfig.node || {}),
                    fs: 'empty',
                    os: 'empty'
                };
            }
            
            // Ensure plugins array exists and provide globals
            webpackConfig.plugins = webpackConfig.plugins || [];
            webpackConfig.plugins.push(
                new webpack.ProvidePlugin({
                    process: 'process/browser',
                    Buffer: ['buffer', 'Buffer']
                })
            );
            
            return webpackConfig;
        }
    },
    env: {
        // Ensure environment variables are available
        REACT_APP_FIREBASE_API_KEY: process.env.REACT_APP_FIREBASE_API_KEY,
        REACT_APP_FIREBASE_AUTH_DOMAIN: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
        REACT_APP_FIREBASE_DATABASE_URL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
        REACT_APP_FIREBASE_PROJECT_ID: process.env.REACT_APP_FIREBASE_PROJECT_ID,
        REACT_APP_FIREBASE_STORAGE_BUCKET: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
        REACT_APP_FIREBASE_MESSAGING_SENDER_ID: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
        REACT_APP_FIREBASE_APP_ID: process.env.REACT_APP_FIREBASE_APP_ID,
        REACT_APP_FIREBASE_MEASUREMENT_ID: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
        NODE_ENV: process.env.NODE_ENV
    }
};
