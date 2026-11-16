const fs = require('fs');
const path = require('path');

// 1. Patch WatermelonDB Android build.gradle (enable BuildConfig generation for AGP 8+)
const targetGradlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@nozbe',
  'watermelondb',
  'native',
  'android',
  'build.gradle'
);

if (fs.existsSync(targetGradlePath)) {
  let content = fs.readFileSync(targetGradlePath, 'utf8');

  if (!content.includes('buildFeatures')) {
    const patch = `
    namespace "com.nozbe.watermelondb"

    buildFeatures {
        buildConfig true
    }
`;
    content = content.replace(/android\s*\{/, `android {${patch}`);
    fs.writeFileSync(targetGradlePath, content, 'utf8');
    console.log('[FinTrack] Successfully patched WatermelonDB Android build.gradle with buildFeatures.buildConfig = true');
  } else {
    console.log('[FinTrack] WatermelonDB Android build.gradle already contains buildFeatures.');
  }
} else {
  console.log('[FinTrack] WatermelonDB path not found, skipping patch.');
}

// 2. Patch expo-modules-autolinking (handle non-JSON unquoted Kotlin string in mirrorKotlinInlineModulesCommand)
const targetAutolinkingPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-modules-autolinking',
  'build',
  'commands',
  'mirrorKotlinInlineModulesCommand.js'
);

if (fs.existsSync(targetAutolinkingPath)) {
  let autolinkingContent = fs.readFileSync(targetAutolinkingPath, 'utf8');

  if (autolinkingContent.includes('JSON.parse(watchedDirectoriesSerialized)') && !autolinkingContent.includes('/* FinTrack Patch */')) {
    const safeParse = `/* FinTrack Patch */ (() => {
            try {
                return JSON.parse(watchedDirectoriesSerialized);
            } catch (err) {
                if (typeof watchedDirectoriesSerialized === 'string' && watchedDirectoriesSerialized.startsWith('[') && watchedDirectoriesSerialized.endsWith(']')) {
                    const inner = watchedDirectoriesSerialized.slice(1, -1).trim();
                    return inner ? inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
                }
                return [];
            }
        })()`;
    autolinkingContent = autolinkingContent.replace(
      'JSON.parse(watchedDirectoriesSerialized)',
      safeParse
    );
    fs.writeFileSync(targetAutolinkingPath, autolinkingContent, 'utf8');
    console.log('[FinTrack] Successfully patched expo-modules-autolinking mirrorKotlinInlineModulesCommand.js with safe parser');
  } else {
    console.log('[FinTrack] expo-modules-autolinking already patched.');
  }
}

// 3. Ensure release buildType is signed with debug keystore for standalone installable APK
const appGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
if (fs.existsSync(appGradlePath)) {
  let appGradleContent = fs.readFileSync(appGradlePath, 'utf8');
  if (appGradleContent.includes('buildTypes {')) {
    const releaseMatch = appGradleContent.match(/release\s*\{([^}]*)\}/);
    if (releaseMatch && !releaseMatch[1].includes('signingConfig')) {
      appGradleContent = appGradleContent.replace(
        /release\s*\{/,
        'release {\n            signingConfig signingConfigs.debug'
      );
      fs.writeFileSync(appGradlePath, appGradleContent, 'utf8');
      console.log('[FinTrack] Successfully configured release build to sign with debug keystore');
    }
  }
}
