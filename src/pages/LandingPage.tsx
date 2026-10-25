import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  Check,
  FileCheck2,
  FolderLock,
  Layers3,
  MapPinned,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Brand, LogoMark } from "../components/Brand";
import { AdFitBanner } from "../components/AdFitBanner";

const flowSteps = [
  { number: "01", title: "필지 묶기", copy: "대표 필지와 연접 필지를 PNU로 연결합니다." },
  { number: "02", title: "절차 구성", copy: "주허가·의제·별도 절차와 신규·변경을 나눕니다." },
  { number: "03", title: "접수·보완", copy: "접수번호와 보완 요청을 원본 이력으로 남깁니다." },
  { number: "04", title: "기한 관리", copy: "근거가 있는 처리기한과 내부 마감을 함께 봅니다." },
  { number: "05", title: "문서 고정", copy: "같은 사건 데이터로 PDF·DOCX 버전을 만듭니다." },
];

const demoTabs = [
  { id: "parcel", label: "필지", icon: MapPinned },
  { id: "permit", label: "허가 구성", icon: Layers3 },
  { id: "deadline", label: "마감", icon: BellRing },
] as const;

export function LandingPage() {
  const [demoTab, setDemoTab] = useState<(typeof demoTabs)[number]["id"]>("parcel");

  return (
    <div className="landing-page">
      <header className="landing-header">
        <Brand />
        <nav aria-label="소개 페이지 메뉴">
          <a href="#workflow">업무 흐름</a>
          <a href="#product">기능</a>
          <a href="#security">팀·보안</a>
        </nav>
        <div className="landing-actions">
          <Link className="button button-ghost" to="/login">로그인</Link>
          <Link className="button button-primary" to="/login?demo=1">체험하기</Link>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={15} /> 인허가 실무를 한 사건으로</div>
            <h1>필지에서 허가·접수·마감까지 <em>한눈에</em></h1>
            <p>
              설계한눈은 여러 필지와 관련 절차, 접수번호, 보완 자료와 제출본을
              한 업무 안에서 끊김 없이 관리하는 실무 공간입니다.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary button-large" to="/login?demo=1">
                샘플 업무로 살펴보기 <ArrowRight size={18} />
              </Link>
              <a className="button button-secondary button-large" href="#workflow">업무 흐름 보기</a>
            </div>
            <div className="hero-note">
              <ShieldCheck size={17} /> 자동 판정이 아닌, 출처와 확인 이력이 남는 업무 보조 도구입니다.
            </div>
          </div>

          <div className="hero-product" aria-label="설계한눈 업무 화면 미리보기">
            <div className="mock-window">
              <div className="mock-titlebar">
                <span /><span /><span />
                <div className="mock-brand"><LogoMark size={22} /> 설계한눈</div>
                <div className="mock-avatar">김</div>
              </div>
              <div className="mock-app">
                <aside>
                  <div className="mock-nav active"><span />업무</div>
                  <div className="mock-nav"><span />문서</div>
                  <div className="mock-nav"><span />자료</div>
                </aside>
                <div className="mock-list">
                  <div className="mock-heading"><b>내 업무</b><i>+</i></div>
                  <div className="mock-search" />
                  <div className="mock-case selected">
                    <div><strong>신남리 물류창고</strong><em>보완요청</em></div>
                    <small>개발행위 · 2필지</small>
                    <span>배수계획 보완 · D-3</span>
                  </div>
                  <div className="mock-case">
                    <div><strong>송산면 진입로</strong><em className="blue">처리중</em></div>
                    <small>도로점용 · 1필지</small>
                    <span>담당부서 확인 · 오늘</span>
                  </div>
                  <div className="mock-case muted">
                    <div><strong>마도면 공장 증설</strong></div>
                    <small>공장설립 변경</small>
                  </div>
                </div>
                <div className="mock-map">
                  <div className="map-grid" />
                  <div className="map-road r1" /><div className="map-road r2" />
                  <div className="map-plot p1" /><div className="map-plot p2" />
                  <div className="map-pin"><span>2</span></div>
                  <div className="mock-sheet">
                    <div className="sheet-top"><b>신남리 물류창고 부지조성</b><em>보완요청</em></div>
                    <div className="sheet-row"><span>다음 할 일</span><strong>배수계획 보완도면 검토</strong><i>D-3</i></div>
                    <div className="sheet-tags"><span>개발행위</span><span>농지전용</span><span>2필지</span></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="floating-label label-parcel"><MapPinned size={16} /> PNU로 필지 연결</div>
            <div className="floating-label label-deadline"><BellRing size={16} /> 근거 있는 D-3</div>
          </div>
        </section>

        <section className="trust-strip" aria-label="제품 원칙">
          <span><Check /> 복수 필지</span>
          <span><Check /> 주허가·의제 분리</span>
          <span><Check /> 제출본 버전 고정</span>
          <span><Check /> 조직별 권한</span>
        </section>

        <section className="workflow-section section-wrap" id="workflow">
          <div className="section-heading">
            <span>업무 흐름</span>
            <h2>접수 전 정보가, 완료할 때까지 이어집니다</h2>
            <p>엑셀·폴더·메신저로 흩어진 같은 값을 사건 하나의 기록으로 연결합니다.</p>
          </div>
          <div className="workflow-grid">
            {flowSteps.map((step, index) => (
              <article key={step.number}>
                <div className="step-number">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                {index < flowSteps.length - 1 && <ArrowRight className="flow-arrow" aria-hidden="true" />}
              </article>
            ))}
          </div>
          <AdFitBanner />
        </section>

        <section className="product-section" id="product">
          <div className="section-wrap product-layout">
            <div className="product-copy">
              <div className="section-heading align-left">
                <span>기능 시연</span>
                <h2>상태가 아니라, 다음 행동이 보이는 화면</h2>
                <p>아래 탭은 실제 제품 구조를 간단히 보여주는 시연입니다.</p>
              </div>
              <div className="demo-tabs" role="tablist" aria-label="기능 시연 선택">
                {demoTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={demoTab === tab.id}
                      key={tab.id}
                      onClick={() => setDemoTab(tab.id)}
                    >
                      <Icon size={18} /> {tab.label}
                    </button>
                  );
                })}
              </div>
              {demoTab === "parcel" && (
                <div className="demo-explanation" role="tabpanel">
                  <h3>대표·연접 필지를 중복 없이</h3>
                  <p>주소 검색과 지도 클릭으로 찾고, 최종 관할은 선택한 필지의 PNU로 판정합니다.</p>
                  <ul><li>현재 위치는 지도 시작점에만 사용</li><li>조회 당시 주소·출처·조회일 저장</li><li>미검증 지역은 법적 적합성 자동 판정 안 함</li></ul>
                </div>
              )}
              {demoTab === "permit" && (
                <div className="demo-explanation" role="tabpanel">
                  <h3>허가 구성과 처리 결과를 분리</h3>
                  <p>개발행위 신규와 산지전용 변경처럼 각 절차의 신청 구분을 따로 보존합니다.</p>
                  <ul><li>주허가·의제·별도 절차 명시</li><li>근거와 협의 결과 확인 이력</li><li>변경 전 허가번호와 영향 문서 추적</li></ul>
                </div>
              )}
              {demoTab === "deadline" && (
                <div className="demo-explanation" role="tabpanel">
                  <h3>자동 예상과 기관 통지를 구분</h3>
                  <p>업무일·휴일 규칙으로 계산하되, 공문 기한을 근거와 함께 우선 적용할 수 있습니다.</p>
                  <ul><li>D-7·D-3·D-1·당일·지연 기본 알림</li><li>수동 변경 사유와 원래 기한 보존</li><li>완료 항목 중복 알림 방지</li></ul>
                </div>
              )}
            </div>

            <div className={`feature-demo demo-${demoTab}`}>
              <div className="feature-demo-head"><span>신남리 물류창고 부지조성</span><b>작성중</b></div>
              {demoTab === "parcel" && (
                <div className="parcel-demo">
                  <div className="demo-map-grid"><span className="parcel-shape a" /><span className="parcel-shape b" /><i>대표</i></div>
                  <div className="parcel-rows">
                    <div><span>대표</span><strong>신남리 145</strong><small>2,431㎡ · 계획관리지역</small><b>확인</b></div>
                    <div><span>연접</span><strong>신남리 146</strong><small>1,638㎡ · 계획관리지역</small><b>확인</b></div>
                  </div>
                </div>
              )}
              {demoTab === "permit" && (
                <div className="permit-demo">
                  <div className="permit-primary"><span>주허가</span><strong>개발행위</strong><em>신규</em></div>
                  <div className="permit-line" />
                  <div className="permit-related"><span>의제 검토</span><strong>농지전용</strong><em>신규 · 회신 확인</em></div>
                  <div className="permit-related warning"><span>별도 절차</span><strong>도로점용</strong><em>검토 필요</em></div>
                </div>
              )}
              {demoTab === "deadline" && (
                <div className="deadline-demo">
                  <div className="deadline-hero"><span>D-3</span><div><strong>배수계획 보완 제출</strong><small>10월 16일 · 공문 기한</small></div></div>
                  <div className="deadline-timeline"><i className="done" /><i className="done" /><i className="active" /><i /></div>
                  <div className="deadline-rows"><span>원래 예상기한 <b>10월 19일</b></span><span>현재 기한 <b>10월 16일</b></span><small>근거 · 2026-10-09 보완요청 공문</small></div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="security-section section-wrap" id="security">
          <div className="section-heading">
            <span>팀과 보안</span>
            <h2>실제 민원 자료에 맞는 경계부터 설계했습니다</h2>
          </div>
          <div className="security-grid">
            <article><UsersRound /><h3>역할별 업무 공간</h3><p>관리자·편집자·열람자의 권한을 조직 단위로 적용합니다.</p></article>
            <article><FolderLock /><h3>비공개 원본</h3><p>첨부는 공개 URL이 아닌 권한이 확인된 Storage 경로에 보관합니다.</p></article>
            <article><FileCheck2 /><h3>재현 가능한 제출본</h3><p>생성 당시 입력값과 첨부 버전을 고정해 다시 출력할 수 있습니다.</p></article>
            <article><ShieldCheck /><h3>확인 가능한 출처</h3><p>자동 채움 값에 원천·조회일·사용자 확인 여부를 함께 남깁니다.</p></article>
          </div>
        </section>

        <section className="closing-section">
          <div className="closing-inner">
            <LogoMark size={54} />
            <h2>다음 업무는, 처음부터 한곳에서 시작하세요</h2>
            <p>설정 없이 샘플 업무 공간을 먼저 둘러볼 수 있습니다.</p>
            <Link className="button button-mint button-large" to="/login?demo=1">
              설계한눈 체험하기 <MousePointer2 size={18} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <Brand compact />
        <p>업무 보조 정보는 공식 허가 판단을 대체하지 않습니다.</p>
        <span>© 2026 설계한눈</span>
      </footer>
    </div>
  );
}
