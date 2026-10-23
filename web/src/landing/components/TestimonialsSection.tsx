"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./testimonials.module.css";

interface Testimonial {
  id: number;
  name: string;
  position: string;
  content: string;
  avatar: string;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    name: "Hikari",
    position: "目标公司：字节·后端开发",
    content: "“通过一周的专项练习，我终于克服了项目介绍的短板，成功拿到了字节的 Offer！”",
    avatar:
      "https://pic.code-nav.cn/user_avatar/1835174163661012994/thumbnail/cw9GmgJkXGDVAKYR.jpg",
  },
  {
    id: 2,
    name: "Simple",
    position: "目标公司：阿里·前端工程师",
    content: "“沉浸式综合面试让我提前适应了节奏，正式面试时完全不怯场。”",
    avatar:
      "https://pic.code-nav.cn/user_avatar/1614948642504835073/thumbnail/mbHOyZgEhdDw6hkm.jpg",
  },
  {
    id: 3,
    name: "雨后的路",
    position: "目标公司：美团·算法工程师",
    content: "“报告里的量化指标非常清晰，按图索骥一周一个维度地提升。”",
    avatar:
      "https://pic.code-nav.cn/user_avatar/1721715091721809921/thumbnail/JuNqY6oZlcLV9nKj.jpg",
  },
  {
    id: 4,
    name: "今天你 coding 了吗",
    position: "目标公司：腾讯·后端开发",
    content: "“真实的面试场景模拟让我提前发现了很多问题，正式面试时更加从容。”",
    avatar:
      "https://pic.code-nav.cn/user_avatar/1622419634546294786/thumbnail/SJvkQaEXgumdXuwm.png",
  },
  {
    id: 5,
    name: "程序员 cq",
    position: "目标公司：百度·前端工程师",
    content: "“AI 面试官的提问很专业，帮我梳理了项目经验的表达逻辑。”",
    avatar:
      "https://pic.code-nav.cn/user_avatar/1608730421619589122/thumbnail/J4W6AGBg-%E5%BE%AE%E4%BF%A1%E5%9B%BE%E7%89%87_20230525204242.jpg",
  },
  {
    id: 6,
    name: "chaseFunny",
    position: "目标公司：京东·产品经理",
    content: "“通过多次练习，我的面试表达能力有了质的飞跃，最终顺利拿到 Offer。”",
    avatar:
      "https://pic.code-nav.cn/user_avatar/1627964538185969665/thumbnail/y13RtMDP-2232861263.jpeg",
  },
  {
    id: 7,
    name: "Jerry",
    position: "目标公司：小米·Java 开发",
    content: "“面试报告的详细分析让我快速定位到自己的薄弱环节，针对性提升效率很高。”",
    avatar:
      "https://thirdwx.qlogo.cn/mmopen/vi_32/DYAIOgq83eoCrt5gYsRpBgXLgs54BhkOqggJho31k4BrITRBJJuAjkXnh0XCiczibTn5wNnGO9LRicbyo8WdrvRRg/132",
  },
  {
    id: 8,
    name: "KUNNIJIWA",
    position: "目标公司：拼多多·算法工程师",
    content: "“模拟面试的难度和真实面试非常接近，让我提前做好了充分准备。”",
    avatar:
      "https://pic.code-nav.cn/post_cover/1696373735390552065/thumbnail/s1j5xJWJ-OIP-C.jpg",
  },
];

export default function TestimonialsSection() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const getFallbackAvatar = (name: string) => {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(
      name
    )}&background=2563eb&color=fff&size=112`;
  };

  return (
    <section
      className={styles.testimonialsSection}
      data-scroll-reveal
      role="region"
      aria-label="用户评价"
    >
      <div className={styles.testimonialsHeader}>
        <h2 className={styles.testimonialsTitle}>
          他们如何斩获 <span className={styles.highlight}>心仪 Offer</span>
        </h2>
      </div>

      <div className={styles.testimonialsScrollContainer}>
        <div
          ref={trackRef}
          className={`${styles.testimonialsTrack} ${
            prefersReducedMotion ? styles.paused : ""
          }`}
        >
          {[...testimonials, ...testimonials].map((item, index) => {
            const isCopy = index >= testimonials.length;
            return (
              <article
                className={styles.testimonialCard}
                key={`${item.id}-${isCopy ? "copy" : "original"}-${index}`}
              >
                <div className={styles.testimonialHeader}>
                  <img
                    alt={item.name}
                    loading="lazy"
                    width={56}
                    height={56}
                    decoding="async"
                    className={styles.testimonialAvatar}
                    src={item.avatar}
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.onerror = null;
                      target.src = getFallbackAvatar(item.name);
                    }}
                  />
                  <div className={styles.testimonialInfo}>
                    <div className={styles.testimonialName}>{item.name}</div>
                    <div className={styles.testimonialPosition}>
                      {item.position}
                    </div>
                  </div>
                </div>
                <div className={styles.testimonialContent}>{item.content}</div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
