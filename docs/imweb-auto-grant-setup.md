# 아임웹 결제 → 앱 이용권 자동 부여 (태그노트)

timeisprice와 같은 방식입니다. 다른 앱·다른 상품에도 복제할 때 이 문서를 참고합니다.

---

## 1. 무엇을 만들었나

**목표:** doodledoodle(아임웹)에서 **69번** 결제 → 태그노트 이용권 자동 부여·연장 (1년)

**고객 흐름 (의도):**

1. 아임웹에서 결제 (이메일 입력)
2. 태그노트 가입 (같은 이메일)
3. 별도 관리자 작업 없이 **active + 1년**

**결제가 가입보다 먼저여도 OK:** 서버에 `pending`으로 적어 두었다가, 가입 시 같은 이메일이면 자동 `applied`.

같은 이메일로 69번을 다시 사면 만료일(`period_end`)이 또 1년 늘어납니다.

---

## 2. 전체 구조 (한눈에)

```
[고객] doodledoodle 결제
    ↓ 웹훅 (ORDER_*)
[Supabase Edge Function] imweb-order-webhook
    ↓ DB 함수
[Supabase] imweb_order_grants (주문 기록)
    ↓ 이미 가입된 이메일이면 즉시 / 아니면 pending
[Supabase] user_subscriptions (1년 이용권)

---

[관리자 1회] 아임웹 개발자센터 OAuth 연동
    ↓ siteCode + OAuth
[Supabase] imweb-connect → imweb-oauth-callback
    ↓ 연동완료 API + 토큰 저장
[Supabase] imweb_site_connections
    ↓ 상태: 테스트연동 → 연동완료
[실주문 웹훅 수신 가능]
```

| 구분 | 역할 |
|------|------|
| **웹훅** | 결제·주문 알림 → 이용권 부여 |
| **OAuth 연동** | 「연동완료」 처리 → **실제 구매** 웹훅 받기 |
| **DB** | 주문 중복 방지, pending, 1년 연장 |

---

## 3. 코드·DB 위치 (이 저장소)

| 파일 | 내용 |
|------|------|
| `supabase/migrations/035_imweb_order_grants.sql` | 주문 기록, 1년 부여 RPC, 가입 시 pending 적용, OAuth 토큰 테이블 |
| `supabase/functions/imweb-order-webhook` | 주문 웹훅 수신 → DB 부여 |
| `supabase/functions/imweb-connect` | OAuth 시작 (`?siteCode=`) |
| `supabase/functions/imweb-oauth-callback` | code → 토큰 → 연동완료 API → DB 저장 |
| `supabase/functions/_shared/imwebOAuth.ts` | OAuth 공통 |
| `supabase/functions/_shared/imwebPayload.ts` | 웹훅 payload 정규화 |
| `src/lib/imwebConnectBootstrap.ts` | `tagtagnote.com?siteCode=` → OAuth 시작 |

대상 상품 번호는 SQL의 `imweb_target_prod_no()` = **69**.

---

## 4. 아임웹 개발자센터 설정

### 4.0 다른 앱에 적용할 때 — 앱을 새로 추가

쇼핑몰(doodledoodle)은 그대로 써도 됩니다.  
**이미 있는 앱(timeisprice 등)의 웹훅 목록에 주문을 하나 더 넣으면 안 됩니다.** 앱 하나당 주문 웹훅은 하나라서, 그다음이 만들어지지 않습니다. 기존 URL을 바꾸면 그 앱이 끊깁니다.

다음에 또 다른 서비스를 붙일 때도 같습니다.

1. 아임웹 개발자센터에서 **앱을 새로 추가**한다.
2. 그 새 앱에서 클라이언트 ID, 클라이언트 Secret, 웹훅, 리다이렉트 URI를 **전부 새로** 받는다.
3. 그 값을 **그 서비스** Supabase Secrets에 넣는다. 다른 앱 Secret을 복사하지 않는다.

### 4.1 앱 정보 (태그노트)

| 항목 | 태그노트 값 |
|------|-------------|
| **서비스 URL** | `https://www.tagtagnote.com` |
| **리다이렉트 URI** | `https://psataiqlkxwjhnunaezc.supabase.co/functions/v1/imweb-oauth-callback` |
| **클라이언트 ID / Secret** | 이 앱 정보에서 복사 → 태그노트 Supabase Secrets |

**리다이렉트 URI 주의:** 아임웹에 등록한 문자열과 Supabase `IMWEB_REDIRECT_URI` Secret이 **한 글자까지 같아야** 합니다.  
(`?apikey=...` 는 **넣지 않음** — `verify_jwt = false`)

### 4.2 API 설정

- **Order(주문)** 읽기 — 승인·ON
- **site-info** — 연동완료 API용 **`site-info:write`** 권한 필요 (scope에 포함)

### 4.3 웹훅

**태그노트 앱**의 웹훅 목록(처음엔 비어 있음)에 하나만 등록합니다.

- URL: `https://psataiqlkxwjhnunaezc.supabase.co/functions/v1/imweb-order-webhook`
- 이벤트: **주문이 생성된 경우**
- **인증 정보(보기)** → `IMWEB_WEBHOOK_SECRET`

### 4.4 연동 (OAuth)

- 왼쪽 **「연동 사이트 관리」** — 테스트 사이트 목록·상태
- **「동의」 버튼이 없을 때:** 이미 **테스트연동** 된 상태일 수 있음
- **연동완료** 로 바꾸려면 OAuth URL을 직접 열거나, 서비스 URL로 `?siteCode=` 리다이렉트

```
https://psataiqlkxwjhnunaezc.supabase.co/functions/v1/imweb-connect?siteCode=<사이트코드>
```

성공 시 `https://www.tagtagnote.com/?imweb=connected` 로 돌아옵니다.

---

## 5. Supabase Secrets (Edge Functions)

화면: 태그노트 프로젝트 → Edge Functions → Secrets

| 이름 | 값 |
|------|-----|
| `IMWEB_CLIENT_ID` | 태그노트 앱의 클라이언트 ID |
| `IMWEB_CLIENT_SECRET` | 태그노트 앱의 클라이언트 Secret |
| `IMWEB_REDIRECT_URI` | `https://psataiqlkxwjhnunaezc.supabase.co/functions/v1/imweb-oauth-callback` |
| `IMWEB_OAUTH_SCOPE` | `order:read site-info:read site-info:write` |
| `IMWEB_CONNECT_SUCCESS_URL` | `https://www.tagtagnote.com/` |
| `IMWEB_WEBHOOK_SECRET` | 태그노트 앱 웹훅 인증 정보 |

배포:

```bash
supabase functions deploy imweb-order-webhook imweb-connect imweb-oauth-callback --project-ref psataiqlkxwjhnunaezc
```

SQL은 `supabase/migrations/035_imweb_order_grants.sql` 을 SQL Editor에서 Run.  
`supabase/config.toml` 에 OAuth·웹훅 함수는 `verify_jwt = false`.

---

## 6. 시행착오 (timeisprice에서 확인한 것)

### 6.1 「테스트연동」 vs 「연동완료」

| 상태 | 실제 구매 웹훅 |
|------|----------------|
| **테스트연동** | ❌ 안 옴 (개발자센터 「테스트 보내기」만 됨) |
| **연동완료** | ✅ 옴 |

**해결:** OAuth → **연동완료 API** 호출까지 끝내기.

### 6.2 `Invalid redirect uri` (오류 30098)

아임웹에 저장한 리다이렉트 URI와 Secret이 한 글자라도 다르면 실패. `?apikey=` 붙이지 말 것.

### 6.3 scope — `site-info:write` 필수

`IMWEB_OAUTH_SCOPE`에 포함 + API 설정에서 해당 권한 승인.

### 6.4 토큰 교환 — `no_access_token`

`/oauth2/token` 은 쿼리스트링 POST, form body 폴백. `accessToken` / `access_token` 둘 다 처리. (코드에 반영됨)

### 6.5 연동완료 API

`PATCH /site-info/integration-complete` 는 빈 body가 통과하는 경우가 있음. 코드에서 여러 번 시도.

### 6.6 웹훅 payload

필드명이 제각각 → `_shared/imwebPayload.ts` 로 정규화.

### 6.7 상품 번호

테스트 보내기 샘플(prodNo 1001 등) → `grant_status: ignored` 가 정상.  
태그노트는 **69번**만 `applied` / `pending`.

---

## 7. 다른 앱에 적용할 때 체크리스트

### A. 아임웹

- [ ] **개발자센터에서 앱을 새로 추가** (기존 앱 웹훅 목록에 주문 추가하지 않기)
- [ ] 클라이언트 ID / Secret **새로** 받기
- [ ] 서비스 URL = **그 앱** 도메인
- [ ] 리다이렉트 URI = **그 프로젝트** `imweb-oauth-callback` (apikey 없이)
- [ ] Order API + site-info write 승인
- [ ] **그 새 앱** 웹훅 목록에 URL 1개 + 웹훅 Secret
- [ ] 테스트 사이트 연동 → **연동완료**까지

### B. Supabase

- [ ] 마이그레이션 Run (`imweb_target_prod_no` = 그 상품 번호, 부여 기간)
- [ ] Secrets: 새 앱의 CLIENT_ID, SECRET, REDIRECT_URI, WEBHOOK_SECRET, SCOPE
- [ ] Edge Functions 배포
- [ ] `user_subscriptions` 컬럼명 맞추기 (태그노트는 `period_end`)

### C. 검증

1. 개발자센터 **테스트 보내기** → `imweb_order_grants` 1줄 (ignored여도 OK)
2. **연동완료** 확인
3. **실제 테스트 결제** (대상 상품 번호)
4. **가입 전 결제** → pending → **같은 이메일 가입** → applied
5. **가입 후 결제** → 즉시 applied
6. `user_subscriptions`: `active`, `period_end` 약 1년

```sql
select order_no, orderer_email, prod_no, grant_status, grant_applied_at, created_at
from imweb_order_grants
where lower(orderer_email) = lower('고객@email.com')
order by created_at desc;

select email, subscription_status, period_start, period_end
from user_subscriptions
where lower(email) = lower('고객@email.com');
```

---

## 8. 운영 시 참고

- **고객에게:** 결제 이메일 = 앱 가입 이메일 (다르면 자동 매칭 안 됨)
- **연장 구매:** 같은 이메일로 또 69번 주문 → 만료일 +1년
- **민감 정보:** Client Secret·Webhook Secret은 Supabase Secrets만. git·채팅에 넣지 않기

---

## 9. 관련 링크

- [앱 연동하기](https://developers-docs.imweb.me/guide/%EC%95%B1-%EC%97%B0%EB%8F%99%ED%95%98%EA%B8%B0)
- [OAuth 2.0](https://developers-docs.imweb.me/guide/%EA%B0%9C%EB%B0%9C-%EA%B0%80%EC%9D%B4%EB%93%9C-%ED%99%95%EC%9D%B8%ED%95%98%EA%B8%B0/oauth-2.0)
- [웹훅 연동 가이드](https://developers-docs.imweb.me/guide/%EA%B0%9C%EB%B0%9C-%EA%B0%80%EC%9D%B4%EB%93%9C-%ED%99%95%EC%9D%B8%ED%95%98%EA%B8%B0/%EC%9B%B9%ED%9B%85-%EC%97%B0%EB%8F%99-%EA%B0%80%EC%9D%B4%EB%93%9C)

---

## 10. 요약

**웹훅으로 “누가 샀는지” 받고, DB가 “1년 줬는지” 기록하고, OAuth 연동완료로 “실제 주문 알림”을 켠다.**  
**서비스를 하나 더 붙일 때는 아임웹 개발자센터에 앱을 새로 추가한다.**
