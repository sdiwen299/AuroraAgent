import { useEffect, useRef, useState } from 'react';

import styles from './InterviewPreview.module.css';
import interviewVideo from '../jpg/生成面试短视频.mp4';

interface InterviewPreviewProps {
  onEnterInterview?: () => void;
}

const messages = [
  {
    role: 'ai',
    text: '你好！今天我们主要讨论一些 Java 后端技术问题。首先，能否解释一下 Spring Boot 的自动配置原理？',
  },
  {
    role: 'user',
    text: 'Spring Boot 的自动配置主要基于 @EnableAutoConfiguration，通过条件注解判断配置是否生效。',
  },
  {
    role: 'ai',
    text: '回答得很好！那么，你能说说 JVM 的垃圾回收机制吗？',
  },
  {
    role: 'user',
    text: 'JVM 主要通过分代收集管理内存，新生代常用复制算法，老年代则更适合标记整理或标记清除算法。',
  },
  {
    role: 'ai',
    text: '思路很清晰。那在高并发场景下，你会如何设计一个线程安全的缓存？',
  },
  {
    role: 'user',
    text: '我会结合本地缓存和 Redis，使用过期时间、互斥锁与逻辑过期避免缓存击穿，并通过消息队列处理缓存更新。',
  },
];

export default function InterviewPreview({ onEnterInterview }: InterviewPreviewProps) {
  const [visibleMessageCount, setVisibleMessageCount] = useState(0);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visibleMessageCount >= messages.length) {
      return undefined;
    }

    const timeout = window.setTimeout(
      () => setVisibleMessageCount((count) => count + 1),
      visibleMessageCount === 0 ? 800 : 3000,
    );

    return () => window.clearTimeout(timeout);
  }, [visibleMessageCount]);

  useEffect(() => {
    const messageList = messagesRef.current;
    if (!messageList) {
      return;
    }

    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: visibleMessageCount > 1 ? 'smooth' : 'auto',
    });
  }, [visibleMessageCount]);

  return (
    <div className={styles.preview} aria-label="沉浸式模拟面试预览">
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div className={styles.windowControls} aria-hidden="true">
            <span className={`${styles.windowControl} ${styles.close}`} />
            <span className={`${styles.windowControl} ${styles.minimize}`} />
            <span className={`${styles.windowControl} ${styles.maximize}`} />
          </div>
          <span className={styles.meetingTitle}>沉浸式模拟面试 · Java 后端开发</span>
        </div>
        <div className={styles.topBarRight}>
          <span className={styles.liveStatus}>● 实时工作台预览</span>
          <button type="button" className={styles.layoutButton} onClick={onEnterInterview}>
            进入真实面试 <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <section className={styles.chatSection} aria-label="面试对话">
          <div ref={messagesRef} className={styles.messages} aria-live="polite">
            {messages.slice(0, visibleMessageCount).map((message, index) => (
              <div key={`${message.role}-${index}`} className={`${styles.message} ${styles[message.role]}`}>
                <span className={styles.avatar} aria-hidden="true">
                  {message.role === 'ai' ? 'AI' : '你'}
                </span>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          <div className={styles.inputArea}>
            <span>请输入您的回答</span>
            <button type="button" aria-label="进入真实面试" onClick={onEnterInterview}>
              ↗
            </button>
          </div>
        </section>

        <aside className={styles.members} aria-label="面试参与者">
          <div className={`${styles.memberCard} ${styles.aiMember}`}>
            <div className={`${styles.memberVisual} ${styles.aiVisual}`}>
              <video
                className={styles.aiVideo}
                src={interviewVideo}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                aria-hidden="true"
              />
            </div>
            <div className={styles.memberInfo}>
              <span className={styles.audioIcon}>⌁</span>
              <strong>AI 面试官</strong>
            </div>
          </div>
          <div className={`${styles.memberCard} ${styles.userMember}`}>
            <div className={`${styles.memberVisual} ${styles.userVisual}`}>
              <div className={styles.userAvatar}>你</div>
            </div>
            <div className={styles.memberInfo}>
              <span className={styles.audioIcon}>⌁</span>
              <strong>候选人 <small>（我）</small></strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
