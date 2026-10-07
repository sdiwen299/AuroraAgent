import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';

import styles from './LandingPage.module.css';
import RippleHeadline from './RippleHeadline';
import CursorGrid from './CursorGrid';
import FlexCarousel from './FlexCarousel';
import ParticleText from './ParticleText';
import InterviewPreview from './InterviewPreview';
import TestimonialsSection from './components/TestimonialsSection';
import FAQSection from './components/FAQSection';
import TechText from './TechText';

interface Props {
  /** 打开登录小窗 */
  onLogin: () => void;
  /** 打开注册小窗 */
  onRegister: () => void;
  /** 进入需要鉴权的真实面试工作台 */
  onEnterInterview?: () => void;
}

/**
 * 落地页：由 web/ai_interview_premium_demo.html 模板改写的中文版。
 * 未登录时作为入口展示，点击按钮弹出登录/注册小窗。
 */
export default function LandingPage({ onLogin, onRegister, onEnterInterview }: Props) {
  const [positionName, setPositionName] = useState('');
  const [experienceRequired, setExperienceRequired] = useState('');
  const [heroCopyVisible, setHeroCopyVisible] = useState(false);
  const [activeNav, setActiveNav] = useState('interview');
  const [scrollProgress, setScrollProgress] = useState(0);
  const heroCopyRef = useRef<HTMLDivElement>(null);
  const practiceCardRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const element = heroCopyRef.current;
    if (!element) return;
    if (!('IntersectionObserver' in window)) {
      setHeroCopyVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHeroCopyVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-reveal]'));
    if (!revealTargets.length) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      revealTargets.forEach((target) => target.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    revealTargets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const targets = ['interview', 'features', 'deploy']
      .map((id) => document.getElementById(id))
      .filter((target): target is HTMLElement => Boolean(target));
    if (!targets.length || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible) setActiveNav(visible.target.id);
      },
      { threshold: [0.15, 0.35, 0.6], rootMargin: '-18% 0px -58% 0px' },
    );
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(scrollable > 0 ? Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100)) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateProgress);
    };
    updateProgress();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const handlePracticePointerMove = (event: PointerEvent<HTMLFormElement>) => {
    if (event.pointerType === 'touch') return;
    const card = practiceCardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty('--card-rotate-x', `${(0.5 - y) * 4}deg`);
    card.style.setProperty('--card-rotate-y', `${(x - 0.5) * 5}deg`);
    card.style.setProperty('--card-glow-x', `${x * 100}%`);
    card.style.setProperty('--card-glow-y', `${y * 100}%`);
  };

  const resetPracticePointer = () => {
    const card = practiceCardRef.current;
    if (!card) return;
    card.style.setProperty('--card-rotate-x', '0deg');
    card.style.setProperty('--card-rotate-y', '0deg');
    card.style.setProperty('--card-glow-x', '50%');
    card.style.setProperty('--card-glow-y', '30%');
  };

  return (
    <main className={styles.page} style={{ '--scroll-progress': `${scrollProgress}%` } as CSSProperties}>
      <div className={styles.scrollProgress} aria-hidden="true"><span /></div>
      <nav className={styles.nav}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>OP</div>
          <span>OfferPilot</span>
        </div>
        <div className={styles.links}>
          <a
            className={`${styles.navLink} ${activeNav === 'interview' ? styles.navLinkActive : ''}`}
            href="/?view=interview#deploy"
            aria-current={activeNav === 'interview' ? 'page' : undefined}
            data-nav-target="interview"
            aria-label="AI 面试练习"
            onClick={(event) => {
              if (!onEnterInterview) return;
              event.preventDefault();
              onEnterInterview();
            }}
          >
            <ParticleText text="AI 面试练习" className={styles.navParticle} fontSize={16} />
          </a>
          <a
            className={`${styles.navLink} ${activeNav === 'features' ? styles.navLinkActive : ''}`}
            href="#features"
            aria-label="功能"
            aria-current={activeNav === 'features' ? 'page' : undefined}
            data-nav-target="features"
          >
            <ParticleText text="功能" className={styles.navParticle} fontSize={16} />
          </a>
          <a
            className={`${styles.navLink} ${activeNav === 'deploy' ? styles.navLinkActive : ''}`}
            href="#deploy"
            aria-label="本地部署"
            aria-current={activeNav === 'deploy' ? 'page' : undefined}
            data-nav-target="deploy"
          >
            <ParticleText text="本地部署" className={styles.navParticle} fontSize={16} />
          </a>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={onLogin}>
            登录
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onRegister}>
            免费试用
          </button>
        </div>
      </nav>

      <section className={styles.hero} id="interview">
        <CursorGrid
          className={styles.heroGrid}
          cellSize={80}
          color="#9f3410"
          radius={170}
          falloff="smooth"
          holdTime={260}
          fadeDuration={640}
          lineWidth={1.2}
          maxOpacity={0.58}
          fillOpacity={0.08}
          gridOpacity={0}
          cellRadius={4}
          clickPulse
          pulseSpeed={760}
        />
        <div className={styles.eyebrow}>
          <span>✦</span>新一代 AI 面试练习
        </div>
        <div className={styles.heroIntro}>
          <form
            ref={practiceCardRef}
            className={styles.practiceCard}
            onPointerMove={handlePracticePointerMove}
            onPointerLeave={resetPracticePointer}
            onSubmit={(event) => {
              event.preventDefault();
              onEnterInterview?.();
            }}
          >
            <div className={styles.practiceCardHeading}>
              <span className={styles.practiceCardIcon} aria-hidden="true">✦</span>
              <div>
                <strong>定制你的面试</strong>
                <span>选择岗位，开始专属练习</span>
              </div>
            </div>

            <label className={styles.field}>
              <span>目标岗位</span>
              <span className={styles.selectWrap}>
                <select
                  aria-label="目标岗位"
                  value={positionName}
                  onChange={(event) => setPositionName(event.target.value)}
                >
                  <option value="">请选择目标岗位</option>
                  <option value="AI Agent开发工程师">AI Agent开发工程师</option>
                  <option value="FDE前沿部署工程师">FDE前沿部署工程师</option>
                  <option value="大模型算法工程师">大模型算法工程师</option>
                  <option value="AI产品经理">AI产品经理</option>
                  <option value="Java后端开发">Java 后端开发</option>
                  <option value="前端开发工程师">前端开发工程师</option>
                </select>
              </span>
            </label>

            <label className={styles.field}>
              <span>工作年限</span>
              <span className={styles.selectWrap}>
                <select
                  aria-label="工作年限"
                  value={experienceRequired}
                  onChange={(event) => setExperienceRequired(event.target.value)}
                >
                  <option value="">请选择工作年限</option>
                  <option value="应届生">应届生 / 0 年</option>
                  <option value="1-3年">1–3 年</option>
                  <option value="3-5年">3–5 年</option>
                  <option value="5年以上">5 年以上</option>
                </select>
              </span>
            </label>

            <button type="submit" className={`${styles.btn} ${styles.startButton}`}>
              开始面试 <span aria-hidden="true">↗</span>
            </button>

            <div className={styles.popularPositions} aria-label="热门岗位">
              <span>热门岗位</span>
              {['AI Agent开发工程师', 'FDE前沿部署工程师', '大模型算法工程师', 'AI产品经理'].map((position) => (
                <button
                  key={position}
                  type="button"
                  className={styles.positionPreset}
                  onClick={() => setPositionName(position)}
                >
                  {position}
                </button>
              ))}
            </div>
          </form>

          <div
            ref={heroCopyRef}
            className={`${styles.heroCopy} ${heroCopyVisible ? styles.heroCopyVisible : ''}`}
          >
            <RippleHeadline
              className={styles.headline}
              autoplay
              autoplayInterval={4600}
              autoplayDelay={2400}
              autoplayStrength={0.62}
              autoplayFade={2800}
            >
              AI 面试陪练
              <br />
              让每一场面试
              <br />
              <span className={styles.marker}>都更有把握。</span>
            </RippleHeadline>

            <p className={styles.sub}>
              按岗位配置面试问题，进行接近真实的对话练习，
              并在每一轮之后拿到结构化的表现分析。
              投递、简历、面试与 Offer 都在同一个工作台里推进。
            </p>

            <div className={styles.cta}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onRegister}>
                免费开始练习
              </button>
              <button type="button" className={styles.btn} onClick={onLogin}>
                进入工作台
              </button>
            </div>
          </div>
        </div>

        <div className={styles.trust} id="deploy">
          <strong>
            <ParticleText text="开源 · 本地优先 · 自带模型" className={styles.trustParticleLead} />
          </strong>
          <span>
            <ParticleText text="Docker 部署" className={styles.trustParticle} />
          </span>
          <span>
            <ParticleText text="源码部署" className={styles.trustParticle} />
          </span>
          <span>
            <ParticleText text="数据自留" className={styles.trustParticle} />
          </span>
          <span>
            <ParticleText text="离线可用" className={styles.trustParticle} />
          </span>
        </div>
        <InterviewPreview onEnterInterview={onEnterInterview} />
        <div className={styles.rule} />

        <div className={styles.scribble} aria-hidden="true" />
        <div className={`${styles.scribble} ${styles.scribbleRight}`} aria-hidden="true" />
      </section>

      <TestimonialsSection />

      <section className={styles.previewLead} data-scroll-reveal>
        <h2 className={styles.previewLeadTitle} aria-label="好 Offer，从一次完美的模拟开始">
          <TechText
            className={styles.previewLeadLine}
            text="好 Offer，"
            decorative
            fontWeight={900}
            fontSize={150}
            letterSpacing={-0.05}
            color="#20340f"
            accentColor="#9f3410"
            lineStyle="dashed"
            specks={12}
            reach={210}
          />
          <TechText
            className={styles.previewLeadLine}
            text="从一次完美的模拟开始"
            decorative
            fontWeight={900}
            fontSize={150}
            letterSpacing={-0.05}
            color="#20340f"
            accentColor="#9f3410"
            lineStyle="dashed"
            specks={12}
            reach={210}
          />
        </h2>
        <p className={styles.previewLeadNote}>反复练习，让下一次面试成为你的高光时刻。</p>
      </section>

      <section className={styles.showcase} id="features" data-scroll-reveal>
        <div className={styles.galleryFrame}>
          <FlexCarousel
            className={styles.gallery}
            preset="liquid"
            intro="rise"
            cardHeight={0.56}
            gap={16}
            radius={14}
            fit="natural"
            lensWidth={0.74}
            lensHeight={1.18}
            tilt={62}
            roundness={1}
            bend={0.34}
            reach={0.38}
            curl="twist"
            dispersion={0.45}
            liquid={0}
            followCursor={false}
            squeeze={0.2}
            focusOnClick
            autoplay
            interval={5}
            captions
            captureWheel={false}
          />
        </div>
      </section>

      <FAQSection />
    </main>
  );
}
