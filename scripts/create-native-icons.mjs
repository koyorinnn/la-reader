// Optional build-time dependency: npm install --no-save sharp
// Run after native projects exist: node scripts/create-native-icons.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const android = path.join(root, 'android/app/src/main/res');
const ios = path.join(root, 'ios/App/App/Assets.xcassets');
const source = await fs.readFile(path.join(root, 'public/icon.svg'), 'utf8');
const paths = source.match(/<path[^>]*\/>/g).join('');
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108"><g transform="translate(11 16) scale(.671875)">${paths}</g></svg>`;
const green = '#22221f';
const paper = '#fbfaf6';
for (const [density, size, foregroundSize] of [['mdpi',48,108], ['hdpi',72,162], ['xhdpi',96,216], ['xxhdpi',144,324], ['xxxhdpi',192,432]]) {
  const folder = path.join(android, `mipmap-${density}`);
  await fs.mkdir(folder, { recursive: true });
  await sharp(Buffer.from(source)).resize(size,size).png().toFile(path.join(folder,'ic_launcher.png'));
  const round = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`);
  await sharp(Buffer.from(source)).resize(size,size).flatten({ background:green }).composite([{ input:round, blend:'dest-in' }]).png().toFile(path.join(folder,'ic_launcher_round.png'));
  await sharp(Buffer.from(foreground)).resize(foregroundSize,foregroundSize).png().toFile(path.join(folder,'ic_launcher_foreground.png'));
}
await fs.writeFile(path.join(android,'values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="ic_launcher_background">${green}</color></resources>\n`);
await fs.writeFile(path.join(android,'drawable/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="${green}" android:pathData="M0,0h108v108h-108z"/></vector>\n`);
// Keep the unused template drawable consistent too; adaptive icons reference mipmaps.
await fs.writeFile(path.join(android,'drawable-v24/ic_launcher_foreground.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="128" android:viewportHeight="128"><path android:fillColor="#f2eddf" android:pathData="M25,33Q45,29 60,39V98Q45,87 25,91Z M103,33Q83,29 68,39V98Q83,87 103,91Z"/></vector>\n`);
const splash = async (file) => {
  const {width,height} = await sharp(file).metadata();
  const size = Math.round(Math.min(width,height)*.19);
  const logo = await sharp(Buffer.from(source)).resize(size,size).png().toBuffer();
  await sharp({create:{width,height,channels:3,background:paper}}).composite([{input:logo,gravity:'centre'}]).png().toFile(`${file}.tmp`);
  await fs.rename(`${file}.tmp`,file);
};
for (const folder of await fs.readdir(android,{withFileTypes:true})) {
  if (!folder.isDirectory() || !folder.name.startsWith('drawable')) continue;
  const file = path.join(android,folder.name,'splash.png');
  try { await fs.access(file); await splash(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await sharp(Buffer.from(source)).resize(1024,1024).flatten({ background:green }).removeAlpha().png().toFile(path.join(ios,'AppIcon.appiconset/AppIcon-512@2x.png'));
for (const filename of await fs.readdir(path.join(ios,'Splash.imageset'))) {
  if (filename.endsWith('.png')) await splash(path.join(ios,'Splash.imageset',filename));
}
console.log('Generated Lá Reader launcher icons and splash images for Android and iOS.');
