export type LiveTalkingOfferResponse = {
  sdp: string;
  type: 'answer';
  sessionid?: string;
};

export type LiveTalkingClientOptions = {
  endpoint: string;
  avatar?: string;
  refAudio?: string;
  fetchImpl?: typeof fetch;
  peerConnectionFactory?: typeof RTCPeerConnection;
};

export type LiveTalkingSession = {
  sessionId: string;
  peerConnection: RTCPeerConnection;
  mediaStream: MediaStream;
  speak: (text: string, options?: { interrupt?: boolean }) => Promise<void>;
  interrupt: () => Promise<void>;
  close: () => void;
};

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '');
}

async function ensureOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(`LiveTalking 请求失败（${response.status}）`);
  }
}

function waitForIceGathering(peerConnection: RTCPeerConnection): Promise<void> {
  if (peerConnection.iceGatheringState === 'complete' || typeof peerConnection.addEventListener !== 'function') return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      window.clearTimeout(timeout);
      peerConnection.removeEventListener('icegatheringstatechange', onStateChange);
      resolve();
    };
    const onStateChange = () => {
      if (peerConnection.iceGatheringState === 'complete') finish();
    };
    const timeout = window.setTimeout(finish, 1500);
    peerConnection.addEventListener('icegatheringstatechange', onStateChange);
  });
}

async function postHuman(
  endpoint: string,
  sessionId: string,
  text: string,
  fetchImpl: typeof fetch,
  interrupt = false,
): Promise<void> {
  const response = await fetchImpl(`${endpoint}/human`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionid: sessionId, text, type: 'echo', interrupt }),
  });
  await ensureOk(response);
  const payload = await response.json() as { code?: number; msg?: string };
  if (payload.code !== undefined && payload.code !== 0) {
    throw new Error(payload.msg || '数字人播报失败');
  }
}

export async function connectLiveTalking(options: LiveTalkingClientOptions): Promise<LiveTalkingSession> {
  const endpoint = normalizeEndpoint(options.endpoint);
  if (!endpoint) throw new Error('未配置数字人服务地址');
  const fetchImpl = options.fetchImpl ?? fetch;
  const PeerConnection = options.peerConnectionFactory ?? RTCPeerConnection;
  const peerConnection = new PeerConnection();
  const mediaStream = new MediaStream();
  try {
    peerConnection.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        if (!mediaStream.getTracks().some((existing) => existing.id === track.id)) mediaStream.addTrack(track);
      }
    };
    peerConnection.addTransceiver('video', { direction: 'recvonly' });
    peerConnection.addTransceiver('audio', { direction: 'recvonly' });
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await waitForIceGathering(peerConnection);
    const localSdp = peerConnection.localDescription?.sdp;
    if (!localSdp) throw new Error('无法创建数字人 WebRTC offer');

    const params = new URLSearchParams();
    if (options.avatar) params.set('avatar', options.avatar);
    if (options.refAudio) params.set('refaudio', options.refAudio);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const response = await fetchImpl(`${endpoint}/offer${suffix}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // LiveTalking accepts avatar/refaudio in the offer body. Keep the query
      // parameters too for older deployments that only read those values.
      body: JSON.stringify({
        sdp: localSdp,
        type: 'offer',
        ...(options.avatar ? { avatar: options.avatar } : {}),
        ...(options.refAudio ? { refaudio: options.refAudio } : {}),
      }),
    });
    await ensureOk(response);
    const payload = await response.json() as LiveTalkingOfferResponse & { code?: number; msg?: string };
    if (payload.code !== undefined && payload.code !== 0) {
      throw new Error(payload.msg || '数字人连接失败');
    }
    if (!payload.sdp || payload.type !== 'answer') throw new Error('数字人返回了无效的 WebRTC answer');
    await peerConnection.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
    const sessionId = payload.sessionid;
    if (!sessionId) throw new Error('数字人连接缺少 session id');

    return {
      sessionId,
      peerConnection,
      mediaStream,
      speak: (text, speakOptions) => postHuman(endpoint, sessionId, text, fetchImpl, speakOptions?.interrupt ?? false),
      interrupt: async () => {
        // LiveTalking's public API names this endpoint /interrupt_talk.
        const interruptResponse = await fetchImpl(`${endpoint}/interrupt_talk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionid: sessionId }),
        });
        await ensureOk(interruptResponse);
      },
      close: () => {
        for (const track of mediaStream.getTracks()) track.stop();
        peerConnection.close();
      },
    };
  } catch (error) {
    peerConnection.close();
    throw error;
  }
}
