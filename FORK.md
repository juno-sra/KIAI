# 포크 안내 (Fork notes)

이 저장소는 코딩 에이전트를 위한 조합형 스킬 라이브러리이자 소프트웨어 개발 방법론인
[obra/superpowers](https://github.com/obra/superpowers)의 포크입니다.

- **업스트림:** https://github.com/obra/superpowers
- **포크 시점:** `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0)
- **라이선스:** MIT — [LICENSE](LICENSE) 참고. 업스트림 저작권 표기는 그대로 유지합니다.

업스트림의 전체 히스토리가 이 저장소에 포함되어 있으므로, 업스트림 변경사항을 그대로
머지해 올 수 있습니다.

## 업스트림 동기화

```bash
git remote add upstream https://github.com/obra/superpowers.git   # 최초 1회
git fetch upstream
git merge upstream/main
```

## 로컬 수정사항

아직 없습니다 — 위 커밋 기준의 업스트림 그대로입니다. 앞으로 업스트림과 달라지는 부분이
생기면 여기에 기록해 두면 이후 머지가 훨씬 수월합니다.

## 구성

- `skills/` — 스킬 라이브러리 (TDD, 체계적 디버깅, 브레인스토밍, 계획 수립/실행,
  서브에이전트 기반 개발, 코드 리뷰, git worktree 사용, 스킬 작성 등)
- `hooks/`, `scripts/` — Claude Code 플러그인 훅과 보조 도구
- `.claude-plugin/`, `.cursor-plugin/`, `.codex-plugin/`, `.devin-plugin/`,
  `.kimi-plugin/`, `.hermes-plugin/`, `.agents/`, `.opencode/`, `.pi/` —
  하네스별 패키징
- `docs/`, `README.md`, `AGENTS.md`, `CLAUDE.md` — 방법론 문서

각 코딩 에이전트별 설치 방법은 [README.md](README.md)를 참고하세요.
