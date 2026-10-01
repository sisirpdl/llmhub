const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const path = require('path');
const config = {
  resolver: {
    resolveRequest(context, moduleName, platform) {
      // The GGUF package exports its Node entry by default. Mobile uses the
      // published browser entry, which has no fs/stream dependencies.
      if (moduleName === '@huggingface/gguf') {
        return {
          type: 'sourceFile',
          filePath: path.join(
            path.dirname(require.resolve('@huggingface/gguf')),
            'browser/index.js',
          ),
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
