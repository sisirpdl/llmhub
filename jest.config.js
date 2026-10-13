module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    // Jest runs CommonJS; Metro uses Lucide's React Native ESM export.
    '^lucide-react-native/icons/(.*)$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
  },
};
