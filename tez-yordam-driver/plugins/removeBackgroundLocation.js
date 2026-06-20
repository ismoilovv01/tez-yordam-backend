const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function removeBackgroundLocation(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    if (manifest['uses-permission']) {
      manifest['uses-permission'] = manifest['uses-permission'].filter(
        (perm) =>
          perm.$['android:name'] !== 'android.permission.ACCESS_BACKGROUND_LOCATION'
      );
    }
    return config;
  });
};
