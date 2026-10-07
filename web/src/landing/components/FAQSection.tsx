"use client";

import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import styles from "./faq.module.css";
import practiceImage from "../assets/faq/faq-practice.jpg";
import feedbackImage from "../assets/faq/faq-feedback.jpg";
import simulationImage from "../assets/faq/faq-simulation.jpg";
import growthImage from "../assets/faq/faq-growth.jpg";
import careerImage from "../assets/faq/faq-career.jpg";

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  image: string;
  defaultActive?: boolean;
}

const faqItems: FAQItem[] = [
  {
    id: 1,
    question: "和真人面试相比，有什么优势？",
    answer:
      "高效、低成本的练习，能提供标准化的评估和无限的练习机会，帮你夯实基础、克服紧张，并且找出自己的薄弱点不断优化。而真人面试更侧重于临场化学反应。通过高频练习，让你在真正的面试中发挥出更好的水平。",
    image: practiceImage,
  },
  {
    id: 2,
    question: "能解决哪些问题？",
    answer:
      "核心解决求职者在面试准备中“没人练、没反馈、没方向”三大痛点。不仅能预测面试问题，提前进行练习准备，还能模拟全流程实战，有效降低临场紧张感。面试结束后的详尽评估报告，会从多个维度为你提供客观、深入的反馈，清晰看到自己的优势和待改进之处，练习一次，就有一次的收获。",
    image: feedbackImage,
  },
  {
    id: 3,
    question: "适合什么样的求职者？",
    answer:
      "无论是零经验的应届生、寻求跳槽的职场人，还是准备转行的探索者，都能提供针对性的帮助。你可以从简历押题开始熟悉，也可以用沉浸式综合面试进行深度模拟练习。",
    image: simulationImage,
  },
  {
    id: 4,
    question: "效果怎么样？",
    answer:
      "效果取决于练习频率和认真程度。每次面试后的报告都是一面“镜子”，清晰记录表达能力、逻辑层次和知识盲区，可以明显感觉到自己从“磕磕绊绊”到“对答如流”的进步。",
    image: growthImage,
  },
  {
    id: 5,
    question: "需要准备什么才能开始面试？",
    answer: "只需要有一个目标岗位和一份简历（可选），即可在 1 分钟内开启首次面试体验！无需复杂准备，现在就开始吧。",
    image: careerImage,
    defaultActive: true,
  },
];

export default function FAQSection() {
  const [activeId, setActiveId] = useState<number | null>(
    faqItems.find((item) => item.defaultActive)?.id ?? null,
  );

  const toggleItem = (id: number) => {
    setActiveId((current) => (current === id ? null : id));
  };

  const handleParallaxMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--faq-parallax-x", `${x * 14}px`);
    event.currentTarget.style.setProperty("--faq-parallax-y", `${y * 10}px`);
  };

  const resetParallax = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--faq-parallax-x", "0px");
    event.currentTarget.style.setProperty("--faq-parallax-y", "0px");
  };

  return (
    <section className={styles.faqSection} data-scroll-reveal>
      <div className={styles.faqContainer}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>常见问题</h2>
          <p className={styles.sectionSubtitle}>
            解答您关于 AI 面试练习的疑问，帮助您更好地了解服务
          </p>
        </div>

        <div className={styles.faqList}>
          {faqItems.map((item) => {
            const isActive = activeId === item.id;
            return (
              <div
                className={`${styles.faqItem} ${isActive ? styles.active : ""}`}
                key={item.id}
                onMouseEnter={() => setActiveId(item.id)}
                onFocus={() => setActiveId(item.id)}
                onPointerMove={handleParallaxMove}
                onPointerLeave={resetParallax}
              >
                <div
                  className={styles.faqQuestion}
                  style={{ "--faq-image": `url(${item.image})` } as CSSProperties}
                >
                  <h3 className={styles.questionText}>{item.question}</h3>
                  <button
                    type="button"
                    className={styles.toggleBtn}
                    aria-label={isActive ? "收起回答" : "展开回答"}
                    aria-expanded={isActive}
                    aria-controls={`faq-answer-${item.id}`}
                    onClick={() => toggleItem(item.id)}
                  >
                    <span className={styles.toggleIcon}>
                      {isActive ? "−" : "+"}
                    </span>
                  </button>
                </div>

                <div
                  id={`faq-answer-${item.id}`}
                  className={styles.faqAnswerWrapper}
                  aria-hidden={!isActive}
                >
                  <div className={styles.faqAnswer}>
                    <p>{item.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
