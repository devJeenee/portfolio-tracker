# Portfolio Tracker MCP Server

Java/Kotlin Spring Boot 프로젝트를 분석하여 **포트폴리오에 쓸 수 있는 강점, 경험, 개선 기회**를 자동으로 찾아주는 [MCP(Model Context Protocol)](https://modelcontextprotocol.io/) 서버입니다.

> Claude Code에서 MCP 서버로 연결하여 사용합니다.

---

## 이런 분들을 위한 도구입니다

- 취업/이직 준비 중 포트폴리오를 정리하고 싶은 백엔드 개발자
- 내 프로젝트에서 어떤 점을 어필할 수 있는지 모르겠는 분
- 코드 품질을 체계적으로 개선하고 싶은 분

## 뭘 해주나요?

| 기능 | 설명 |
|------|------|
| **강점 분석** | 현재 코드에서 잘 구현된 패턴 자동 감지 (레이어드 아키텍처, Spring Security, DDD 등) |
| **경험 발굴** | Git 커밋 히스토리에서 면접에서 말할 수 있는 개선 경험 추출 |
| **개선 기회** | 포트폴리오 가치가 높은 코드 개선 포인트 43가지 규칙으로 탐색 |
| **성숙도 평가** | 프로젝트를 0-100점으로 평가 (S/A/B/C/D/F 등급) |
| **개발 스토리** | Git에서 트러블슈팅, 리팩토링, 아키텍처 변경 스토리 추출 |
| **문제 추적** | 개발 중 만난 문제 → 해결 과정을 기록 |

---

## 설치

### 1. 클론 및 빌드

```bash
git clone https://github.com/devJeenee/portfolio-tracker.git
cd portfolio-tracker
npm install
npm run build
```

### 2. 분석할 프로젝트에 MCP 서버 등록

분석하고 싶은 Spring Boot 프로젝트 루트에 `.mcp.json` 파일을 생성합니다:

```json
{
  "mcpServers": {
    "portfolio-tracker": {
      "command": "node",
      "args": ["/path/to/portfolio-tracker/dist/index.js"]
    }
  }
}
```

> `args`의 경로를 portfolio-tracker를 클론한 실제 절대 경로로 변경하세요.

### 3. 슬래시 커맨드 복사 (선택)

더 편하게 사용하려면 커맨드 파일도 복사합니다:

```bash
mkdir -p /your/spring-project/.claude/commands
cp /path/to/portfolio-tracker/.claude/commands/*.md /your/spring-project/.claude/commands/
```

### 4. Claude Code에서 사용

```bash
cd /your/spring-project
claude
```

> 새 세션을 열어야 `.mcp.json`이 인식됩니다.

---

## 사용법

### 슬래시 커맨드

커맨드 파일을 복사했다면:

| 커맨드 | 설명 |
|--------|------|
| `/portfolio` | **멀티 스텝 종합 분석** — 프로젝트 구조 파악 → 포트폴리오 분석 → 조건부 코드 상세 분석 → 종합 리포트 (한줄 요약, 어필 TOP 5, 이력서 초안) |
| `/strengths` | 기술적 강점 분석 + 이력서 키워드 추출 제안 |
| `/experiences` | **Git 경험 심화** — 경험 발굴 → high impact 경험은 커밋 추가 분석 → STAR 형식 가공 |
| `/opportunities` | **개선 기회 + 실행 가이드** — 기회 탐색 → 상위 5개 코드 상세 분석 → 구체적 수정 방향 + 예상 점수 변화 |
| `/maturity` | **성숙도 + 비교 분석** — 프로젝트 규모 파악 → 성숙도 평가 → 주니어 프로젝트 기준 비교 코멘트 |
| `/analyze` | 코드 품질 분석 + 심각도별 맞춤 대응 가이드 |
| `/git-story` | Git에서 개발 스토리 추출 + 면접 스크립트 제안 |
| `/log-problem` | 문제 기록 (입력 부족 시 대화형 보충 질문) |
| `/resolve-problem` | 문제 해결 기록 + 포트폴리오 리포트 생성 안내 |

모든 커맨드에 **에러 핸들링** (Spring 프로젝트 미감지, Git 없음, 결과 비어있음 등)과 **후속 액션 제안** (결과에 따라 관련 커맨드 안내)이 포함되어 있습니다.

### 자연어로 사용

커맨드 없이도 Claude에게 직접 요청할 수 있습니다:

```
"이 프로젝트의 포트폴리오 강점을 분석해줘"
"Git 히스토리에서 내가 개선한 경험을 찾아줘"
"코드 품질 이슈를 찾아줘"
"프로젝트 성숙도 점수를 매겨줘"
```

---

## MCP 도구 목록

| 도구 | 설명 |
|------|------|
| `portfolio_insight` | 종합 포트폴리오 분석 (강점 + 경험 + 기회 + 성숙도) |
| `analyze_code` | 코드 품질 분석 + 개선 기회 감지 |
| `analyze_git` | Git 히스토리 분석 (개발 스토리, churn 감지) |
| `analyze_project` | 프로젝트 구조 스캔 (기술 스택, 통계) |
| `list_opportunities` | 개선 기회 우선순위 정렬 |
| `generate_report` | 포트폴리오 리포트 생성 |
| `log_problem` | 개발 중 문제 기록 |
| `resolve_problem` | 문제 해결 기록 |

---

## 감지 규칙 (43개)

### 아키텍처 (9개)
Fat Controller, 서비스 레이어 누락, God Service, 순환 의존, DTO 누락, 역방향 레이어 의존, 잘못된 레이어 배치, 레이어 스킵, API 구조

### 아키텍처 — DDD (3개)
빈약한 도메인 모델, 도메인 외부 의존, Aggregate 경계 침범

### 보안 (4개 + 설정 파일 스캔)
하드코딩된 시크릿, SQL Injection, 민감 정보 로깅, 인증 누락, 설정 파일(.yml/.properties) 시크릿 스캔

### 테스트 (3개)
Service / Controller / 통합 테스트 누락

### 성능 · 쿼리 (4개)
N+1 쿼리, SELECT *, LIKE 와일드카드, 페이지네이션 없는 findAll

### 캐싱 (3개)
캐시 어노테이션 누락, 캐싱 후보, 분산 캐시 후보

### 장애 대응 (4개)
Circuit Breaker 누락, 타임아웃 누락, 재시도 누락, Fallback 누락

### 관측성 (4개)
커스텀 메트릭 누락, 요청 추적 누락, Health Check 누락, 비구조화 로깅

### 동시성 (3개)
싱글톤 가변 상태, 동기적 외부 호출, 안전하지 않은 공유 자원

### 코드 품질 (4개)
필드 주입(@Autowired), System.out 사용, 장메서드(50줄+), @Value 남용

### 트랜잭션 (3개)
@Transactional 누락, 읽기 전용 트랜잭션, Controller 트랜잭션

### API 설계 (3개)
페이지네이션 누락, 응답 형식 비일관, HTTP 상태 코드 누락

### 프로덕션 준비 (5개)
API 문서 누락, DB 마이그레이션 누락, CORS 설정 누락, Rate Limiting 누락, Graceful Shutdown 누락

---

## 컨벤션 커스터마이징

프로젝트 루트에 `.spring-conventions.json`을 생성하면 임계값과 규칙을 조정할 수 있습니다:

```json
{
  "architecture": {
    "type": "auto"
  },
  "thresholds": {
    "controllerMaxLines": 200,
    "serviceMaxLines": 500,
    "serviceMaxDependencies": 8,
    "serviceMaxMethods": 15
  },
  "naming": {
    "controllerSuffix": "Controller",
    "serviceSuffix": "Service",
    "repositorySuffix": "Repository",
    "dtoSuffix": ["Dto", "DTO", "Response", "Request"]
  },
  "rules": {
    "disabled": ["missing-rate-limiting", "missing-graceful-shutdown"],
    "severityOverrides": {
      "n-plus-one": "high"
    }
  }
}
```

- `architecture.type`: `"auto"` (자동감지) | `"layered"` | `"ddd"`
- `rules.disabled`: 비활성화할 규칙 이름 배열
- `rules.severityOverrides`: 심각도 재정의

없으면 기본값으로 동작합니다.

---

## API 키

**필요 없습니다.** 모든 분석은 로컬에서 패턴 매칭으로 동작합니다.

단, `generate_report` 도구의 LLM 기반 서술문 생성 기능만 선택적으로 Anthropic API 키를 사용합니다. 키가 없어도 에러 없이 데이터만 반환됩니다.

LLM 서술문을 원할 경우, 2단계에서 생성한 `.mcp.json`의 `env`에 키를 추가하면 됩니다:

```json
{
  "mcpServers": {
    "portfolio-tracker": {
      "command": "node",
      "args": ["/path/to/portfolio-tracker/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-api03-..."
      }
    }
  }
}
```

Anthropic API 키는 [console.anthropic.com](https://console.anthropic.com/)에서 발급받을 수 있습니다.

---

## 지원 환경

- **언어**: Java, Kotlin
- **프레임워크**: Spring Boot (Spring MVC, Spring Data JPA, Spring Security 등)
- **빌드**: Maven (`pom.xml`) 또는 Gradle (`build.gradle`)
- **요구사항**: Node.js 18+, Claude Code

---

## 기술 스택

> 분석 **대상**은 Java/Kotlin Spring Boot이고, 이 MCP 서버 **자체**는 아래 기술로 만들어져 있습니다.

- TypeScript (ES2022)
- [MCP SDK](https://github.com/modelcontextprotocol/sdk) — Claude Code 연동
- [simple-git](https://github.com/steveukx/git-js) — Git 히스토리 분석
- [Zod](https://github.com/colinhacks/zod) — 스키마 검증
- [tsup](https://github.com/egoist/tsup) — 번들러

## License

MIT
