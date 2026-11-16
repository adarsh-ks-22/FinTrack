const fs = require('fs');
const path = require('path');

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
