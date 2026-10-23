"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./testimonials.module.css";
import avatarHikari from "../assets/avatars/1-hikari.jpg";
import avatarSimple from "../assets/avatars/2-simple.jpg";
import avatarYuhou from "../assets/avatars/3-yuhou-de-lu.jpg";
import avatarCoding from "../assets/avatars/4-coding.jpg";
import avatarChengxuyuan from "../assets/avatars/5-chengxuyuan-cq.jpg";
import avatarChasefunny from "../assets/avatars/6-chasefunny.jpg";
import avatarJerry from "../assets/avatars/7-jerry.jpg";
import avatarKunni from "../assets/avatars/8-kunni.jpg";

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
      avatarHikari,
  },
  {
    id: 2,
    name: "Simple",
    position: "目标公司：阿里·前端工程师",
    content: "“沉浸式综合面试让我提前适应了节奏，正式面试时完全不怯场。”",
    avatar:
      avatarSimple,
  },
  {
    id: 3,
    name: "雨后的路",
    position: "目标公司：美团·算法工程师",
    content: "“报告里的量化指标非常清晰，按图索骥一周一个维度地提升。”",
    avatar:
      avatarYuhou,
  },
  {
    id: 4,
    name: "今天你 coding 了吗",
    position: "目标公司：腾讯·后端开发",
    content: "“真实的面试场景模拟让我提前发现了很多问题，正式面试时更加从容。”",
    avatar:
      avatarCoding,
  },
  {
    id: 5,
    name: "程序员 cq",
    position: "目标公司：百度·前端工程师",
    content: "“AI 面试官的提问很专业，帮我梳理了项目经验的表达逻辑。”",
    avatar:
      avatarChengxuyuan,
  },
  {
    id: 6,
    name: "chaseFunny",
    position: "目标公司：京东·产品经理",
    content: "“通过多次练习，我的面试表达能力有了质的飞跃，最终顺利拿到 Offer。”",
    avatar:
      avatarChasefunny,
  },
  {
    id: 7,
    name: "Jerry",
    position: "目标公司：小米·Java 开发",
    content: "“面试报告的详细分析让我快速定位到自己的薄弱环节，针对性提升效率很高。”",
    avatar:
      avatarJerry,
  },
  {
    id: 8,
    name: "KUNNIJIWA",
    position: "目标公司：拼多多·算法工程师",
    content: "“模拟面试的难度和真实面试非常接近，让我提前做好了充分准备。”",
    avatar:
      avatarKunni,
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
