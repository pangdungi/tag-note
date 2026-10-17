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

## 4. 아임웹은 새로 안 만든다

쇼핑몰·타임이프라이스 앱·웹훅 URL·연동완료는 **그대로** 둡니다.  
앱 하나당 주문 웹훅은 하나라서, 타임이프라이스 웹훅 목록에 주소를 더 넣거나 바꾸면 안 됩니다.

실제 주문은 타임이프라이스 `imweb-order-webhook`이 받습니다.

- 66·67번 → 지금처럼 타임이프라이스만 처리
- **69번** → 타임이프라이스는 손대지 않고, 태그노트 웹훅으로만 넘김

태그노트 쪽에 필요한 건 수파베이스뿐입니다. 아임웹 앱 추가·OAuth·클라이언트 ID는 하지 않습니다.

---

## 5. 단계 (이 순서)

공유 비밀번호를 하나 만듭니다. 아임웹 웹훅 Secret이 아닙니다. 두 수파베이스가 서로 알아볼 값입니다.

### 5.1 태그노트 수파베이스

화면: 태그노트 프로젝트 (`psataiqlkxwjhnunaezc`)

1. SQL Editor에서 `supabase/migrations/035_imweb_order_grants.sql` Run
2. Edge Functions → Secrets
   - `IMWEB_WEBHOOK_SECRET` = 방금 만든 공유 비밀번호
3. 함수 배포

```bash
supabase functions deploy imweb-order-webhook --project-ref psataiqlkxwjhnunaezc
```

`supabase/config.toml` 에 이 함수는 `verify_jwt = false`.

### 5.2 타임이프라이스 수파베이스

아임웹 웹훅 URL·`IMWEB_WEBHOOK_SECRET`은 **바꾸지 않습니다.**

Edge Functions → Secrets에만 추가:

| 이름 | 값 |
|------|-----|
| `TAGNOTE_IMWEB_WEBHOOK_URL` | `https://psataiqlkxwjhnunaezc.supabase.co/functions/v1/imweb-order-webhook` |
| `TAGNOTE_IMWEB_WEBHOOK_SECRET` | 태그노트와 **같은** 공유 비밀번호 |
| `TAGNOTE_IMWEB_PROD_NO` | `69` (없어도 기본 69) |

그다음 **이 함수만** 다시 배포:

```bash
supabase functions deploy imweb-order-webhook --project-ref <타임이프라이스-ref>
```

66·67 처리 코드는 그대로입니다. 69일 때만 태그노트로 POST 한 번 더 합니다. 전달이 실패해도 타임이프라이스 응답은 200 그대로입니다.

---

## 6. 확인

1. 69번 **실제 테스트 결제** (또는 연동완료된 앱의 테스트 보내기에 prodNo 69)
2. 태그노트 `imweb_order_grants` 1줄
3. **가입 전 결제** → pending → **같은 이메일 가입** → applied
4. **가입 후 결제** → 즉시 applied
5. `user_subscriptions`: `active`, `period_end` 약 1년
6. 66·67번은 타임이프라이스만 변하고 태그노트에는 줄이 안 생김

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

## 7. 운영 시 참고

- **고객에게:** 결제 이메일 = 태그노트 가입 이메일 (다르면 자동 매칭 안 됨)
- **연장 구매:** 같은 이메일로 또 69번 주문 → 만료일 +1년
- **민감 정보:** 공유 비밀번호는 Secrets만. git·채팅에 넣지 않기
- 아임웹 앱을 태그노트로 새로 만들지 말 것. 웹훅 URL을 바꾸지 말 것.

---

## 8. 요약

**이미 붙어 있는 타임이프라이스 웹훅이 주문을 받고, 69번만 태그노트 수파베이스로 넘긴다.**  
타임이프라이스 부여·아임웹 연동은 그대로 둔다.
