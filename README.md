# 체커드 (CHECKERED)

https://rak-kr.github.io/checkered/

카트 레이싱 웹 게임입니다. 봇 스피드전, 팀전, 타임어택(고스트), 친구 대결(최대 8명), 차고(스킨), 회원가입·랭킹을 지원합니다.

## 파일 구성

| 파일 | 내용 |
|---|---|
| `index.html` | 화면 구조 |
| `style.css` | 디자인 |
| `config.js` | **서버 주소 설정** (서버를 만든 뒤 한 줄만 고침) |
| `core.js` | 주행 물리, 맵, 봇, 고스트 |
| `profile.js` | 스킨 목록, 코인, 도전 과제, 저장, 서버 통신 |
| `game.js` | 화면 그리기, 소리, 조작, 메뉴, 친구 대결, 차고 |
| `server/worker.js` | Cloudflare Worker 서버 코드 |
| `server/schema.sql` | D1 데이터베이스 표 만들기 |
| `server/wrangler.toml` | (선택) 명령어로 배포할 때만 쓰는 설정. 아래 순서대로 하면 필요 없음 |

> 이 작업은 **PC에서** 하는 걸 권합니다. 휴대폰에서는 GitHub 파일 올리기가 불편합니다.

---

## 0. 파일 풀기

1. `checkered.zip`을 PC에 저장하고 압축을 풉니다.
2. `checkered` 폴더 안에 파일 7개(index.html, style.css, config.js, core.js, profile.js, game.js, README.md)와 `server` 폴더가 있는지 확인합니다.

---

## 1. 게임을 GitHub에 올리기

1. github.com에 로그인합니다.
2. 오른쪽 위 **+** → **New repository**
3. 설정
   - Repository name: `checkered`
   - **Public** 선택 (GitHub Pages 무료 사용에 필요)
   - "Add a README file"은 **체크하지 않음**
4. **Create repository**
5. 빈 저장소 화면에서 **uploading an existing file** 글자를 누릅니다.
6. `checkered` 폴더의 **파일 7개**를 끌어다 놓습니다. (`server` 폴더는 올리지 않아도 됩니다)
7. 맨 아래 **Commit changes**
8. 저장소 위쪽 **Settings** 탭 → 왼쪽 메뉴 **Pages**
9. Build and deployment
   - Source: **Deploy from a branch**
   - Branch: **main**, 폴더 **/ (root)** → **Save**
10. 1~2분 뒤 Pages 화면을 새로고침하면 위쪽에 주소가 나옵니다: `https://rak-kr.github.io/checkered/`
11. 그 주소로 들어가 게임이 실행되면 완료. 이 상태에서도 게스트로 모든 모드를 할 수 있습니다.

---

## 2. Cloudflare에 데이터베이스(D1) 만들기

1. dash.cloudflare.com 로그인
2. 왼쪽 메뉴 **Storage & databases** → **D1 SQL database**
3. **Create** (또는 **Create Database**)
4. 이름 `checkered-db` 입력, 위치는 자동 그대로 → **Create**
5. 만들어진 `checkered-db`를 눌러 들어가서 **Console** 탭
6. PC에서 `server/schema.sql`을 메모장으로 열고 **전부 복사** (Ctrl+A → Ctrl+C)
7. Console 입력창에 붙여 넣고 **Execute**
8. **Tables** 탭에 `users`, `sessions`, `records` 3개가 보이면 성공

---

## 3. Cloudflare에 서버(Worker) 만들기

1. 왼쪽 메뉴 **Compute (Workers)** → **Workers & Pages**
2. **Create** → **Create Worker** (템플릿을 고르라고 하면 **Hello World**)
3. 이름을 `checkered-server`로 바꾸고 **Deploy**
4. 배포가 끝나면 **Edit code**
5. 왼쪽에 열린 코드 파일(worker.js 또는 index.js) 내용을 **전부 지움**
6. PC에서 `server/worker.js`를 메모장으로 열어 **전부 복사**해서 붙여 넣기
7. 오른쪽 위 **Deploy**

---

## 4. 서버에 데이터베이스와 게임 주소 연결

1. `checkered-server` 관리 화면으로 돌아가서 **Settings** 탭
2. **Bindings** → **Add** → **D1 database**
   - Variable name: `DB` ← 반드시 **대문자 DB**
   - D1 database: `checkered-db`
   - **Add Binding** (또는 Deploy)
3. 같은 Settings 화면의 **Variables and Secrets** → **Add**
   - Type: **Text**
   - Variable name: `ALLOWED_ORIGINS`
   - Value: `https://rak-kr.github.io` ← 끝에 `/`나 `/checkered/`를 **붙이지 않음**
   - **Deploy**

---

## 5. 서버 주소 확인

1. Worker 화면 위쪽(또는 Settings → **Domains & Routes**)에서 `checkered-server.○○○.workers.dev` 형태의 주소를 찾습니다.
2. 브라우저 주소창에 그 주소 뒤에 `/api/health`를 붙여서 엽니다.
   - 예: `https://checkered-server.○○○.workers.dev/api/health`
3. `{"ok":true}`가 나오면 서버 완료
4. `/api/health`를 **뺀** 주소를 복사해 둡니다.

---

## 6. 게임과 서버 연결

1. GitHub `checkered` 저장소에서 `config.js` 클릭
2. 오른쪽 위 **연필 아이콘(Edit)**
3. `API_BASE: ''` 따옴표 사이에 서버 주소를 붙여 넣기 (끝에 `/` 없이)
   ```js
   API_BASE: 'https://checkered-server.○○○.workers.dev'
   ```
4. **Commit changes**를 두 번 눌러 저장
5. 1~2분 뒤 게임 주소를 **강력 새로고침** (PC: Ctrl+Shift+R / 휴대폰: 브라우저를 완전히 닫았다 다시 열기)

---

## 7. 잘 되는지 확인

1. 게임 메인 화면 왼쪽 위 **게스트 · 로그인**
2. **회원가입** 탭에서 아이디·비밀번호 입력 후 가입
3. 나오는 **복구 코드를 꼭 적어 두기** (다시 보여 주지 않음)
4. 타임어택 한 판 완주 → 결과에 '서버 랭킹 1위'가 나오는지 확인
5. 메뉴 → 타임어택 → **랭킹에서 고르기**에 내 기록이 보이면 모두 완료
6. 친구들에게는 게임 주소 `https://rak-kr.github.io/checkered/` 만 보내면 됩니다.

---

## 문제가 생기면

| 증상 | 확인할 것 |
|---|---|
| '서버에 연결하지 못했어요' | `config.js` 주소 오타, `https://` 빠짐, 끝에 `/`가 붙었는지 |
| '데이터베이스(DB)가 연결되지 않았어요' | 4단계 Variable name이 정확히 대문자 `DB`인지 |
| 가입할 때 '서버 오류' | 2단계 7번(schema.sql 실행) — Tables 탭에 표 3개가 있는지 |
| 로그인 자체가 막힘 | 4단계 `ALLOWED_ORIGINS` 값이 `https://rak-kr.github.io` 인지 |

---

## 알아 두기

- **로그인·랭킹은 GitHub 주소로 접속했을 때만 됩니다.** PC에서 `index.html`을 더블클릭해 열면 서버가 접속을 막아서 게스트로만 동작합니다.
- **비밀번호**: 서버에 원문이 가지 않습니다. 브라우저가 먼저 느린 해시를 만들고, 서버가 사용자마다 다른 값을 섞어 한 번 더 해시해서 저장합니다.
- **비밀번호 찾기**: 이메일을 받지 않으므로 가입할 때 받은 **복구 코드**로 새 비밀번호를 정합니다.
- **로그인 실패 제한**: 같은 아이디로 8번 틀리면 10분 동안 막힙니다.
- **코인 조작**: 주행은 각자 기기에서 계산되므로 서버가 완전히 검증할 수는 없습니다. 짧은 시간에 비정상적으로 늘어난 코인이나 맵 길이에 비해 너무 빠른 기록은 서버가 막습니다.
- **무료 한도**: Cloudflare 무료 플랜은 요청 하나당 CPU 10ms 제한이 있는데, 이 서버에서 가장 무거운 요청(5바퀴 고스트 업로드)도 약 4ms라 무료로 충분합니다.
- **친구 대결**은 서버와 별개로 공개 PeerJS 서버로 방을 찾습니다. 모두 같은 버전의 파일을 써야 방에 들어갈 수 있습니다.
- **업데이트**: 게임 파일이 바뀌면 바뀐 파일만 1단계 5~7번처럼 다시 올리면 됩니다. 서버 코드가 바뀌면 3단계 4~7번만 다시 하면 되고, 저장된 계정과 기록은 그대로 남습니다.
- Cloudflare 메뉴 이름은 가끔 바뀝니다. 위 이름과 조금 달라도 같은 기능을 찾으면 됩니다.
