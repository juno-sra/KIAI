/**
 * 빌드 산출물에 정적 파일을 옮긴다.
 *
 * TypeScript는 .ts만 내보낸다. preload(.cjs)와 화면의 html/css/글꼴은
 * 그대로 복사해야 앱이 실제로 열린다.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'desktop', 'src');
const dist = join(here, '..', 'desktop', 'dist');

const copies = [
  ['preload', /\.cjs$/],
  ['renderer', /\.(html|css)$/],
];

for (const [folder, pattern] of copies) {
  const from = join(src, folder);
  const to = join(dist, folder);
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (pattern.test(name)) cpSync(join(from, name), join(to, name));
  }
}

// 글꼴은 저장소에 두지 않는다(용량·배포 조건). 있으면 같이 넣는다.
const fonts = join(src, 'renderer', 'fonts');
if (existsSync(fonts)) {
  cpSync(fonts, join(dist, 'renderer', 'fonts'), { recursive: true });
} else {
  console.warn('[SMP] Pretendard 글꼴 파일이 없습니다. 설치된 Pretendard로 대체됩니다.');
}

console.log('[SMP] 정적 파일 복사 완료');
