import { describe, expect, it, vi } from 'vitest';
import { connectLiveTalking } from './liveTalkingClient';

class FakeTrack {
  readonly id = 'track-1';
  stopped = false;

  stop() { this.stopped = true; }
}

class FakeMediaStream {
  private readonly tracks: FakeTrack[] = [];

  getTracks() { return this.tracks; }
  addTrack(track: FakeTrack) { this.tracks.push(track); }
}

class FakePeerConnection {
  localDescription: { sdp: string } | null = null;
  iceGatheringState = 'complete';
  ontrack: ((event: { streams: FakeMediaStream[]; track: FakeTrack }) => void) | null = null;
  closed = false;

  addTransceiver() { return undefined; }
  async createOffer() { return { type: 'offer', sdp: 'local-sdp' }; }
  async setLocalDescription() { this.localDescription = { sdp: 'local-sdp' }; }
  async setRemoteDescription() { return undefined; }
  close() { this.closed = true; }
}

describe('connectLiveTalking', () => {
  it('negotiates WebRTC and exposes text and interrupt commands', async () => {
    vi.stubGlobal('MediaStream', FakeMediaStream);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/offer')) return { ok: true, json: async () => ({ sdp: 'remote-sdp', type: 'answer', sessionid: 'session-1' }) } as Response;
      return { ok: true, json: async () => ({ code: 0 }) } as Response;
    });
    const session = await connectLiveTalking({
      endpoint: ' http://localhost:8010/ ',
      avatar: 'avatar-1',
      refAudio: 'voice-1',
      fetchImpl,
      peerConnectionFactory: FakePeerConnection as unknown as typeof RTCPeerConnection,
    });

    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8010/offer?avatar=avatar-1&refaudio=voice-1', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit).body))).toMatchObject({
      avatar: 'avatar-1',
      refaudio: 'voice-1',
      type: 'offer',
    });
    await session.speak('请介绍一下你的项目', { interrupt: true });
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8010/human', expect.objectContaining({ body: expect.stringContaining('请介绍一下你的项目') }));
    await session.interrupt();
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:8010/interrupt_talk', expect.anything());
    session.close();
    expect((session.peerConnection as unknown as FakePeerConnection).closed).toBe(true);
  });

  it('closes the peer when the offer response is invalid', async () => {
    vi.stubGlobal('MediaStream', FakeMediaStream);
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ type: 'answer' }) }) as Response);
    let peer: FakePeerConnection | undefined;
    class SinglePeer extends FakePeerConnection {
      constructor() {
        super();
        peer = this;
      }
    }
    await expect(connectLiveTalking({
      endpoint: 'http://localhost:8010',
      fetchImpl,
      peerConnectionFactory: SinglePeer as unknown as typeof RTCPeerConnection,
    })).rejects.toThrow('无效的 WebRTC answer');
    expect(peer?.closed).toBe(true);
  });
});
