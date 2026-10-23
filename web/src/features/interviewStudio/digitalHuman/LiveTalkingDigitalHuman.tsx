import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Tag } from 'antd';
import { DisconnectOutlined, PlayCircleOutlined, ReloadOutlined, SoundOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { connectLiveTalking, type LiveTalkingSession } from './liveTalkingClient';
import styles from './LiveTalkingDigitalHuman.module.css';
import interviewerPreviewVideo from '../../../jpg/生成面试短视频.mp4';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'degraded' | 'error';

type Props = {
  question: string;
  endpoint?: string;
  avatar?: string;
  refAudio?: string;
  autoConnect?: boolean;
  speakQuestions?: boolean;
  /** Monotonic command id used when continuous voice mode re-reads the same question. */
  speakTrigger?: number;
  onConnectionChange?: (connected: boolean) => void;
};

// LiveTalking's documented WebRTC port is 8010. Keep the service opt-in so a
// local browser never reports a misleading connection failure when the GPU
// service is not running.
const configuredEndpoint = typeof import.meta.env.VITE_LIVETALKING_URL === 'string'
  && import.meta.env.VITE_LIVETALKING_URL.trim()
  ? import.meta.env.VITE_LIVETALKING_URL.trim()
  : undefined;
const configuredAvatar = typeof import.meta.env.VITE_LIVETALKING_AVATAR === 'string'
  && import.meta.env.VITE_LIVETALKING_AVATAR.trim()
  ? import.meta.env.VITE_LIVETALKING_AVATAR.trim()
  : undefined;
const configuredRefAudio = typeof import.meta.env.VITE_LIVETALKING_REF_AUDIO === 'string'
  && import.meta.env.VITE_LIVETALKING_REF_AUDIO.trim()
  ? import.meta.env.VITE_LIVETALKING_REF_AUDIO.trim()
  : undefined;

function statusLabel(state: ConnectionState): string {
  if (state === 'connecting') return '正在连接';
  if (state === 'connected') return '已连接';
  if (state === 'degraded') return '本地预览';
  if (state === 'error') return '连接失败';
  return '未连接';
}

export default function LiveTalkingDigitalHuman({ question, endpoint = configuredEndpoint, avatar = configuredAvatar, refAudio = configuredRefAudio, autoConnect = true, speakQuestions = true, speakTrigger, onConnectionChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<LiveTalkingSession | null>(null);
  const lastSpokenQuestionRef = useRef('');
  const lastSpeakTriggerRef = useRef<number | undefined>(undefined);
  const [state, setState] = useState<ConnectionState>(endpoint ? 'idle' : 'degraded');
  const stateRef = useRef(state);
  stateRef.current = state;
  const [error, setError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  useEffect(() => {
    onConnectionChange?.(state === 'connected');
  }, [onConnectionChange, state]);

  const disconnect = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setAudioBlocked(false);
    setState(endpoint ? 'idle' : 'degraded');
  }, [endpoint]);

  const connect = useCallback(async () => {
    if (!endpoint || stateRef.current === 'connecting' || stateRef.current === 'connected') return;
    setState('connecting');
    setError(null);
    try {
      const session = await connectLiveTalking({ endpoint, avatar, refAudio });
      sessionRef.current = session;
      if (videoRef.current) {
        videoRef.current.srcObject = session.mediaStream;
        videoRef.current.muted = false;
        await videoRef.current.play().catch(() => setAudioBlocked(true));
      }
      setState('connected');
    } catch (cause) {
      setState('error');
      setError(cause instanceof Error ? cause.message : '数字人连接失败');
    }
  }, [avatar, endpoint, refAudio]);

  useEffect(() => {
    if (autoConnect && endpoint) void connect();
    return () => {
      sessionRef.current?.close();
      sessionRef.current = null;
    };
  }, [autoConnect, connect, endpoint]);

  const speakQuestion = useCallback(() => {
    if (state !== 'connected' || !question.trim()) return;
    lastSpokenQuestionRef.current = question;
    void sessionRef.current?.speak(question, { interrupt: true }).catch((cause) => {
      lastSpokenQuestionRef.current = '';
      setError(cause instanceof Error ? cause.message : '题目播报失败');
    });
  }, [question, state]);

  useEffect(() => {
    if (!speakQuestions || speakTrigger !== undefined || question === lastSpokenQuestionRef.current) return;
    speakQuestion();
  }, [question, speakQuestion, speakQuestions, speakTrigger]);

  useEffect(() => {
    if (speakTrigger === undefined || speakTrigger === lastSpeakTriggerRef.current || state !== 'connected') return;
    lastSpeakTriggerRef.current = speakTrigger;
    speakQuestion();
  }, [speakQuestion, speakTrigger]);

  const speakAgain = () => {
    if (state === 'connected') void sessionRef.current?.speak(question, { interrupt: true }).catch(() => setError('题目播报失败'));
    else if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(question);
      utterance.lang = 'zh-CN';
      window.speechSynthesis.speak(utterance);
    }
  };

  const enableAudio = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    void video.play().then(() => setAudioBlocked(false)).catch(() => setError('浏览器仍阻止数字人声音，请检查页面声音权限。'));
  };

  return (
    <section className={styles.panel} data-testid="live-talking-digital-human" aria-label="AI 数字人面试官">
      <div
        className={styles.visual}
        data-fallback={state !== 'connected'}
      >
        <video
          ref={videoRef}
          className={styles.video}
          autoPlay
          playsInline
          aria-label="数字人视频"
        />
        <div className={styles.fallback} data-visible={state !== 'connected'} aria-hidden={state === 'connected'}>
          <video
            className={styles.fallbackVideo}
            src={interviewerPreviewVideo}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
          />
          <div className={styles.previewShade} />
          <div className={styles.fallbackIdentity}>
            <span className={styles.avatar}><VideoCameraOutlined /></span>
            <span className={styles.fallbackCopy}>
              <strong>AI 面试官</strong>
              <span>{endpoint ? '预览形象 · 连接后切换实时口型' : '本地预览 · 语音与画面未做口型同步'}</span>
            </span>
          </div>
        </div>
        <div className={styles.stageTopline}>
          <span className={styles.liveBadge}><i data-state={state} />{statusLabel(state)}</span>
          <span className={styles.stageBrand}>AURORA INTERVIEW</span>
        </div>
        {question.trim() ? (
          <button type="button" className={styles.questionCaption} onClick={speakAgain} aria-label="播报当前问题">
            <span className={styles.captionLabel}>面试官提问</span>
            <strong>{question}</strong>
            <SoundOutlined />
          </button>
        ) : null}
      </div>
      <div className={styles.copy}>
        <div className={styles.heading}><div className={styles.identity}><span className={styles.kicker}>DIGITAL INTERVIEWER</span><h2>AI 数字人面试官</h2></div><Tag color={state === 'connected' ? 'green' : state === 'error' ? 'orange' : 'default'}>{statusLabel(state)}</Tag></div>
        <p>{state === 'connected' ? '面试官会播报新问题；回答仍由你确认后提交。' : '人物负责呈现和播报，题目、回答确认与复盘由 AuroraAgent 控制。'}</p>
        <div className={styles.actions}>
          {endpoint && state !== 'connected' ? <Button type="primary" icon={state === 'error' ? <ReloadOutlined /> : <PlayCircleOutlined />} loading={state === 'connecting'} onClick={() => void connect()}>{state === 'error' ? '重新连接' : '连接数字人'}</Button> : null}
          {state === 'connected' ? <Button icon={<DisconnectOutlined />} onClick={disconnect}>断开</Button> : null}
          {state === 'connected' && audioBlocked ? <Button type="primary" icon={<SoundOutlined />} onClick={enableAudio}>启用数字人声音</Button> : null}
          <Button icon={<SoundOutlined />} onClick={speakAgain} disabled={!question.trim()}>{state === 'connected' ? '播报当前问题' : '朗读当前问题'}</Button>
        </div>
        {error ? <span className={styles.error} role="status">{error}，已保留本地练习能力。</span> : null}
      </div>
    </section>
  );
}
