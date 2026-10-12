# 설계한눈

필지 선택부터 허가·의제 구성, 문서 작성, 접수와 보완, 마감까지 하나의 업무로 이어 관리하는 조직용 MVP입니다. 공개 소개 페이지와 로그인 후 업무 앱을 한 React 애플리케이션에서 제공합니다.

## 현재 구현 범위

- 돌봄한눈의 색상·카드·간격 체계를 적용한 반응형 공개 랜딩
- 데스크톱 목록/지도 분할 화면, 모바일 목록/지도 전환과 상세 바텀시트
- 7단계 신규 업무 마법사와 브라우저 임시저장
- 복수 필지, 주허가·의제·별도허가, 신규·변경 구분
- 샘플 접수번호 조회와 직접입력 전환
- 첨부 검증·비공개 Storage 업로드, PDF·PNG·JPG 미리보기, 원본 다운로드
- 생성 스냅샷이 고정되는 버전별 PDF·DOCX 문서와 열람자 다운로드
- 달력일/업무일/휴일/수동조정 기한 계산과 기본 알림 시점
- 관리자·편집자·열람자 역할, 조직 격리 Rules, 감사 이벤트
- 조직 상태·허가·의제 관계·기본 알림을 Firestore에 실시간 저장
- VWorld/NED 인증 프록시, 조직 초대·수락, 09:00 KST 중복 방지 알림 함수
- 업무별 알림 하위 컬렉션을 연결한 인앱 알림과 수신자 읽음 표시
- Firebase 미연결 상태에서도 동작하는 로컬 샘플 업무 공간

샘플 조회와 지역 기준은 법적 판단이나 실제 민원 처리 상태를 의미하지 않습니다. 제출 전 관할기관과 최신 공식 근거를 확인해야 합니다.

## 기술 구성

- React 19, TypeScript, Vite 8, OpenLayers
- Firebase Hosting, Authentication, Firestore, Storage, App Check
- Cloud Functions v2와 Scheduler (`asia-northeast3`, Node.js 22)
- Vitest, Firebase Rules Unit Testing

Node.js 22.12 이상을 사용합니다. Functions 운영 런타임은 Node.js 22로 고정되어 있습니다. Firebase Emulator 실행에는 Java 21 이상이 필요합니다.

## 로컬 실행

```bash
corepack enable
pnpm install
pnpm dev
```

Firebase 설정이 없는 상태에서는 `/login?demo=1` 또는 로그인 화면의 `샘플 업무 공간으로 시작`으로 전체 UI를 확인할 수 있습니다.

기본 검증 명령은 다음과 같습니다.

```bash
pnpm test
pnpm build
pnpm functions:build
pnpm test:emulator
```

## Firebase 연결

1. 새 Firebase 프로젝트를 만들고 Firestore 데이터베이스 위치를 `asia-northeast3`로 선택합니다.
2. Authentication에서 Google 및 이메일/비밀번호 로그인을 활성화하고 지원 이메일을 설정합니다.
3. `.env.example`을 `.env.local`로 복사해 웹 앱 구성을 입력합니다.
4. `.firebaserc.example`을 `.firebaserc`로 복사해 프로젝트 ID를 입력합니다.
5. ReCAPTCHA Enterprise 사이트 키를 `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`에 지정하고 App Check 등록을 완료합니다.
6. VWorld 키는 저장소에 넣지 않고 Secret Manager에 등록합니다.

```bash
pnpm exec firebase login
pnpm exec firebase functions:secrets:set VWORLD_API_KEY
```

Functions의 일반 파라미터는 `functions/.env.<project-id>`에 둡니다.

```dotenv
ALLOWED_ORIGINS=https://<project-id>.web.app
VWORLD_DOMAIN=<project-id>.web.app
```

VWorld 콘솔에도 같은 허용 도메인을 등록해야 합니다. 실제 민원 조회 제공자가 준비되기 전까지 접수 조회는 화면과 응답 모두 `샘플 조회`로 표시됩니다.

## 데이터 구조

```text
users/{uid}
organizations/{organizationId}
  members/{uid}
  invitations/{invitationId}
  settings/{settingId}
  catalogs/{catalogId}
  cases/{caseId}
    parcels/{parcelId}
    sections/{sectionId}
    notes/{noteId}
    attachments/{attachmentId}
    events/{eventId}
    documents/{documentId}
    notifications/{notificationId}
```

클라이언트 Rules는 조직 멤버십을 확인합니다. 열람자는 읽기와 다운로드만 가능하고, 편집자는 업무를 수정할 수 있으며, 구성원·조직 설정·카탈로그 관리는 관리자만 가능합니다. 감사 이벤트, 생성 문서, 알림은 서버 함수만 기록합니다.

현재 위치는 지도 시작점 추천에만 사용하고 저장하지 않습니다. 필지에는 조회 당시 PNU, 주소, 용도지역, 출처, 조회일을 스냅샷으로 저장합니다.

## 배포

GitHub `main` 브랜치에 푸시하면 GitHub Actions가 검증과 빌드를 수행한 뒤 Pages에 정적 체험판을 배포합니다.

- 저장소: <https://github.com/softm/softm.seolgyehannun>
- 체험판: <https://softm.github.io/softm.seolgyehannun/>

Pages 빌드는 Firebase 비밀값 없이 샘플 업무 공간으로 동작하며, Hash Router를 사용해 새로고침과 하위 화면 이동을 지원합니다. 실제 조직 데이터·로그인·파일 저장·Cloud Functions를 사용하려면 아래 Firebase 운영 배포를 별도로 연결해야 합니다.

먼저 Emulator에서 검증한 뒤 Preview Channel을 사용합니다.

```bash
pnpm verify
pnpm test:emulator
pnpm deploy:preview
```

승인 후에만 운영 채널로 배포합니다.

```bash
pnpm deploy
```

Functions와 Scheduler 배포에는 Blaze 요금제와 결제 계정이 필요합니다. 운영 전 비용 알림, 사용량 한도, App Check 강제 여부, VWorld 허용 도메인을 함께 확인하세요.

## 저장소와 비밀정보

- `.env`, Firebase 로컬 상태, 빌드 산출물, 의존성은 Git에서 제외합니다.
- API 키와 SMTP 자격증명은 Secret Manager에만 저장합니다.
- 첨부와 생성 문서는 공개 URL을 만들지 않습니다.
- `DWG`, `DXF`, `DOCX`, `HWPX`, `XLSX`는 최대 50MB까지 비공개 보관하며, 실행 파일은 허용하지 않습니다.
- 영구 오프라인 캐시는 사용자가 신뢰 기기에서 명시적으로 켠 경우에만 사용합니다.
