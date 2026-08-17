const { withAppBuildGradle } = require('@expo/config-plugins');

// MARK: `expo prebuild` regenerates android/, so signing has to be injected at
// prebuild time. Editing build.gradle by hand would be silently reverted on the
// next prebuild and the release APK would go back to the debug key.

const GUARD = "project.hasProperty('LEIT_RELEASE_STORE_FILE')";

const RELEASE_SIGNING_CONFIG = `
        release {
            if (${GUARD}) {
                storeFile file(LEIT_RELEASE_STORE_FILE)
                storePassword LEIT_RELEASE_STORE_PASSWORD
                keyAlias LEIT_RELEASE_KEY_ALIAS
                keyPassword LEIT_RELEASE_KEY_PASSWORD
            }
        }`;

/**
 * The credentials live in ~/.gradle/gradle.properties, outside the repository,
 * and the keystore itself is never committed. When they are absent, which is
 * the case for anyone who just cloned the project, the build falls back to the
 * debug key so `assembleRelease` still produces an installable APK instead of
 * failing.
 */
function addReleaseSigningConfig(buildGradle) {
  if (buildGradle.includes('LEIT_RELEASE_STORE_FILE')) {
    return buildGradle;
  }

  const signingConfigsAnchor = 'signingConfigs {';
  const anchorIndex = buildGradle.indexOf(signingConfigsAnchor);

  if (anchorIndex === -1) {
    throw new Error('withReleaseSigning: signingConfigs block not found in build.gradle.');
  }

  const insertAt = anchorIndex + signingConfigsAnchor.length;

  return buildGradle.slice(0, insertAt) + RELEASE_SIGNING_CONFIG + buildGradle.slice(insertAt);
}

function useReleaseSigningConfig(buildGradle) {
  const debugSigningInRelease = /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/s;

  if (!debugSigningInRelease.test(buildGradle)) {
    return buildGradle;
  }

  return buildGradle.replace(
    debugSigningInRelease,
    `$1signingConfig ${GUARD} ? signingConfigs.release : signingConfigs.debug`,
  );
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: only the Groovy build.gradle is supported.');
    }

    gradleConfig.modResults.contents = useReleaseSigningConfig(
      addReleaseSigningConfig(gradleConfig.modResults.contents),
    );

    return gradleConfig;
  });
};
