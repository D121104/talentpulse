import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  Share2,
  MessageSquare,
  Users,
  ShieldCheck,
  Clock,
  Send,
  X,
  AlertCircle,
  Volume2,
  VolumeX,
  Settings,
  ChevronUp,
  Headphones,
  Pin,
  PinOff,
  Power,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../context/ToastContext';
import { employerApi, InterviewRoundItem } from '../../lib/employerApi';
import { getInterviewRoomSocket } from '../../lib/socket';

interface ChatMessage {
  message: string;
  senderSocketId: string;
  senderName: string;
  senderRole: string;
  timestamp: string;
}

interface PeerInfo {
  socketId: string;
  userId: string;
  userName: string;
  userRole: string;
  hasVideo: boolean;
  hasAudio: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isScreenSharing?: boolean;
  isSpeaking?: boolean;
  stream?: MediaStream;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// Optimal audio constraints for crystal clear studio speech, preserving natural vocal resonance and word endings
const getAudioConstraints = (deviceId?: string): MediaTrackConstraints => ({
  deviceId: deviceId ? { exact: deviceId } : undefined,
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 },
  // Advanced Chromium flags: preserves chest resonance/decay without clipping syllables or crackling
  googEchoCancellation: true,
  googAutoGainControl: true,
  googNoiseSuppression: true,
  googHighpassFilter: false, // Prevents cutting off natural voice warmth & tail decay
  googTypingNoiseDetection: true,
  googAudioMirroring: false,
} as any);

// Optimize Opus SDP parameters for crystal clear voice without crackling or syllable dropouts
function tuneOpusSdp(sdp: string): string {
  let newSdp = sdp;
  if (newSdp.includes('opus/48000')) {
    // 1. minptime=20;ptime=20;maxptime=40: standard 20ms packet frames eliminate buffer underruns, popping, and crackles
    // 2. useinbandfec=1: in-band Forward Error Correction heals jitter and packet loss automatically
    // 3. usedtx=0: continuous packet transmission so word endings and natural vocal decay are NEVER clipped
    // 4. maxaveragebitrate=64000: optimal 64 kbps speech clarity
    // 5. stereo=0;sprop-stereo=0: mono speech eliminates phase comb filtering
    // 6. cbr=0: variable bitrate for natural dynamic voice range
    const opusParams =
      'minptime=20;ptime=20;maxptime=40;useinbandfec=1;maxaveragebitrate=64000;stereo=0;sprop-stereo=0;usedtx=0;cbr=0';
    newSdp = newSdp.replace(
      /a=fmtp:(\d+) [^\r\n]+/g,
      (match, pt) => {
        if (newSdp.includes(`a=rtpmap:${pt} opus/48000`)) {
          return `a=fmtp:${pt} ${opusParams}`;
        }
        return match;
      },
    );
    if (!newSdp.includes('useinbandfec=1')) {
      newSdp = newSdp.replace(
        /a=rtpmap:(\d+) opus\/48000\/2/g,
        `a=rtpmap:$1 opus/48000/2\r\na=fmtp:$1 ${opusParams}`,
      );
    }
  }
  return newSdp;
}

export default function InterviewRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user, accessToken } = useAuth();
  const { error, info } = useToast();
  const navigate = useNavigate();

  const [round, setRound] = useState<InterviewRoundItem | null>(null);
  const [userRoleInRoom, setUserRoleInRoom] = useState<'INTERVIEWER' | 'CANDIDATE'>('CANDIDATE');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Local media state
  const [hasCamera, setHasCamera] = useState(true);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Audio output / input devices (Zoom-like audio selector)
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('');
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);
  const [audioAutoplayBlocked, setAudioAutoplayBlocked] = useState(false);

  // Call duration
  const [callDuration, setCallDuration] = useState(0);

  // Pinning feature (Zoom / Google Meet spotlight)
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // End Meeting & Room Ended state
  const [isEndMeetingDialogOpen, setIsEndMeetingDialogOpen] = useState(false);
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [isMeetingEndedModalOpen, setIsMeetingEndedModalOpen] = useState(false);
  const [meetingEndedData, setMeetingEndedData] = useState<{ endedBy?: string; message?: string } | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState(6);

  // Panels
  const [isChatOpen, setIsChatOpen] = useState(false);
  const isChatOpenRef = useRef(isChatOpen);
  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // WebRTC Peer connections: socketId -> RTCPeerConnection
  const peersRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  // Pending ICE candidates queue: socketId -> candidates[]
  const pendingIceCandidatesRef = useRef<{ [socketId: string]: RTCIceCandidateInit[] }>({});
  // Dedicated programmatic HTMLAudioElement for each remote participant
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  // Dedicated MediaStream containing only audio tracks for each remote participant
  const remoteAudioStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  // Combined MediaStream for UI video rendering
  const remoteCombinedStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  // Remote audio analyzers for speaking indicators
  const remoteAudioAnalysersRef = useRef<
    Map<string, { ctx: AudioContext; analyser: AnalyserNode; interval: any }>
  >(new Map());

  // Remote streams: socketId -> MediaStream
  const [remotePeers, setRemotePeers] = useState<{ [socketId: string]: PeerInfo }>({});

  // Local media stream ref
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const isStreamInitializedRef = useRef(false);

  // Socket
  const socketRef = useRef<any>(null);

  // Speaking indicator state
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioIntervalRef = useRef<any>(null);
  const isSpeakingRef = useRef<boolean>(false);
  const lastSpeakingTimestampRef = useRef<number>(0);

  // Synchronized refs to avoid recreating callbacks and tearing down WebRTC room
  const isMicMutedRef = useRef(isMicMuted);
  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  const isCameraOffRef = useRef(isCameraOff);
  useEffect(() => {
    isCameraOffRef.current = isCameraOff;
  }, [isCameraOff]);

  const hasCameraRef = useRef(hasCamera);
  useEffect(() => {
    hasCameraRef.current = hasCamera;
  }, [hasCamera]);

  const isScreenSharingRef = useRef(isScreenSharing);
  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  const selectedMicIdRef = useRef(selectedMicId);
  useEffect(() => {
    selectedMicIdRef.current = selectedMicId;
  }, [selectedMicId]);

  const selectedSpeakerIdRef = useRef(selectedSpeakerId);
  useEffect(() => {
    selectedSpeakerIdRef.current = selectedSpeakerId;
  }, [selectedSpeakerId]);

  const displayStreamRef = useRef<MediaStream | null>(null);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const userRoleInRoomRef = useRef(userRoleInRoom);
  useEffect(() => {
    userRoleInRoomRef.current = userRoleInRoom;
  }, [userRoleInRoom]);

  // Synchronize local video element srcObject whenever streams or share status change
  useEffect(() => {
    if (localVideoRef.current) {
      const targetStream = isScreenSharing
        ? (displayStreamRef.current || (screenTrackRef.current ? new MediaStream([screenTrackRef.current]) : null))
        : (hasCamera && !isCameraOff ? localStreamRef.current : null);
      if (targetStream && localVideoRef.current.srcObject !== targetStream) {
        localVideoRef.current.srcObject = targetStream;
      }
    }
  }, [isScreenSharing, hasCamera, isCameraOff, pinnedId]);

  const cleanupAudioDetection = useCallback(() => {
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  }, []);

  const cleanupRemoteAudioDetection = useCallback((socketId?: string) => {
    if (socketId) {
      const item = remoteAudioAnalysersRef.current.get(socketId);
      if (item) {
        if (item.interval) clearInterval(item.interval);
        if (item.ctx) item.ctx.close().catch(() => {});
        remoteAudioAnalysersRef.current.delete(socketId);
      }
    } else {
      remoteAudioAnalysersRef.current.forEach((item) => {
        if (item.interval) clearInterval(item.interval);
        if (item.ctx) item.ctx.close().catch(() => {});
      });
      remoteAudioAnalysersRef.current.clear();
    }
  }, []);

  const setupRemoteAudioDetection = useCallback(
    (socketId: string, stream: MediaStream) => {
      cleanupRemoteAudioDetection(socketId);
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.4;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        let isSpeaking = false;
        let lastSpeaking = 0;

        const interval = setInterval(() => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
          const now = Date.now();
          if (avg > 24) {
            lastSpeaking = now;
            if (!isSpeaking) {
              isSpeaking = true;
              setRemotePeers((prev) => {
                const peer = prev[socketId];
                if (!peer || peer.isSpeaking) return prev;
                return { ...prev, [socketId]: { ...peer, isSpeaking: true } };
              });
            }
          } else {
            if (isSpeaking && now - lastSpeaking > 350) {
              isSpeaking = false;
              setRemotePeers((prev) => {
                const peer = prev[socketId];
                if (!peer || !peer.isSpeaking) return prev;
                return { ...prev, [socketId]: { ...peer, isSpeaking: false } };
              });
            }
          }
        }, 100);

        remoteAudioAnalysersRef.current.set(socketId, { ctx, analyser, interval });
      } catch {
        // Ignore audio context error
      }
    },
    [cleanupRemoteAudioDetection],
  );

  // 1. Fetch Room details & verify permissions
  useEffect(() => {
    if (!roomId || !accessToken) return;

    let isMounted = true;
    employerApi
      .getInterviewRoom(roomId, accessToken)
      .then((data) => {
        if (!isMounted) return;
        setRound(data.round);
        setUserRoleInRoom(data.userRoleInRoom);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Lỗi truy cập phòng phỏng vấn', err);
        setErrorMessage(err?.message || 'Không thể truy cập phòng phỏng vấn này.');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [roomId, accessToken]);

  // 2. Call duration timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2b. Auto-check scheduled endTime and close room when time expires
  useEffect(() => {
    if (!round?.scheduledEndAt) return;
    const checkEndTime = () => {
      const now = new Date().getTime();
      const end = new Date(round.scheduledEndAt).getTime();
      if (now >= end && !isMeetingEndedModalOpen) {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        if (screenTrackRef.current) {
          screenTrackRef.current.stop();
        }
        cleanupAudioDetection();
        Object.values(peersRef.current).forEach((pc) => pc.close());
        peersRef.current = {};

        setMeetingEndedData({
          endedBy: 'Hệ thống TalentPulse',
          message:
            'Thời gian phỏng vấn theo lịch đã kết thúc. Phòng họp đã tự động đóng lại.',
        });
        setIsMeetingEndedModalOpen(true);
      }
    };

    const interval = setInterval(checkEndTime, 5000);
    return () => clearInterval(interval);
  }, [round?.scheduledEndAt, isMeetingEndedModalOpen, cleanupAudioDetection]);

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m
        .toString()
        .padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 3. Audio level detection for speaking indicator (throttled 100ms with hysteresis to avoid render thrashing)
  const setupAudioDetection = useCallback((stream: MediaStream) => {
    cleanupAudioDetection();
    try {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      audioIntervalRef.current = setInterval(() => {
        if (!localStreamRef.current || isMicMutedRef.current) {
          if (isSpeakingRef.current) {
            isSpeakingRef.current = false;
            setIsLocalSpeaking(false);
          }
          return;
        }

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((p, c) => p + c, 0) / dataArray.length;
        const now = Date.now();

        if (average > 28) {
          lastSpeakingTimestampRef.current = now;
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            setIsLocalSpeaking(true);
          }
        } else {
          // Hold speaking indicator for 350ms so it doesn't flicker or re-render continuously
          if (isSpeakingRef.current && now - lastSpeakingTimestampRef.current > 350) {
            isSpeakingRef.current = false;
            setIsLocalSpeaking(false);
          }
        }
      }, 100);
    } catch {
      // Ignore audio context error
    }
  }, [cleanupAudioDetection]);

  // Enumerate Audio Devices (Zoom-like Device Picker)
  const enumerateAudioDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices.filter((d) => d.kind === 'audioinput');
      const speakers = devices.filter((d) => d.kind === 'audiooutput');
      setAudioInputDevices(mics);
      setAudioOutputDevices(speakers);

      if (mics.length > 0 && !selectedMicIdRef.current) {
        setSelectedMicId(mics[0].deviceId);
      }
      if (speakers.length > 0 && !selectedSpeakerIdRef.current) {
        setSelectedSpeakerId(speakers[0].deviceId);
      }
    } catch (err) {
      console.warn('Không thể liệt kê thiết bị âm thanh:', err);
    }
  }, []);

  // Select Audio Output (Speaker / Headphones)
  const handleSelectSpeaker = async (deviceId: string) => {
    setSelectedSpeakerId(deviceId);
    remoteAudioElementsRef.current.forEach((audioEl) => {
      if (audioEl && 'setSinkId' in audioEl) {
        (audioEl as any).setSinkId(deviceId).catch(console.warn);
      }
    });
  };

  // Select Audio Input (Microphone)
  const handleSelectMic = async (deviceId: string) => {
    setSelectedMicId(deviceId);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: getAudioConstraints(deviceId),
      });
      const newAudioTrack = newStream.getAudioTracks()[0];
      if (localStreamRef.current) {
        const oldAudioTrack = localStreamRef.current.getAudioTracks()[0];
        if (oldAudioTrack) {
          localStreamRef.current.removeTrack(oldAudioTrack);
          oldAudioTrack.stop();
        }
        localStreamRef.current.addTrack(newAudioTrack);
      }

      Object.values(peersRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
        if (sender) {
          sender.replaceTrack(newAudioTrack);
        }
      });

      setupAudioDetection(localStreamRef.current || newStream);
    } catch (err) {
      console.error('Lỗi khi đổi microphone', err);
    }
  };

  // Test Speaker (Play melodic chime like Zoom)
  const handleTestSpeaker = async () => {
    try {
      setIsTestingSpeaker(true);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      if (selectedSpeakerId && 'setSinkId' in audioCtx) {
        await (audioCtx as any).setSinkId(selectedSpeakerId).catch(() => {});
      }

      const now = audioCtx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);
        gain.gain.setValueAtTime(0, now + idx * 0.15);
        gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.15 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.35);
      });

      setTimeout(() => {
        setIsTestingSpeaker(false);
        audioCtx.close().catch(() => {});
      }, 900);
    } catch (err) {
      console.error('Lỗi khi kiểm tra loa:', err);
      setIsTestingSpeaker(false);
    }
  };

  // Unlock Audio if Browser Autoplay Policy Blocked
  const handleUnlockAudio = () => {
    remoteAudioElementsRef.current.forEach((el) => {
      el.play().catch(console.warn);
    });
    setAudioAutoplayBlocked(false);
  };

  // Auto unlock remote audio on user interaction
  useEffect(() => {
    const handleGlobalClickToUnblockAudio = () => {
      let anyBlocked = false;
      remoteAudioElementsRef.current.forEach((el) => {
        if (el.paused && el.srcObject) {
          el.play().catch(() => {
            anyBlocked = true;
          });
        }
      });
      if (!anyBlocked) {
        setAudioAutoplayBlocked(false);
      }
    };
    window.addEventListener('click', handleGlobalClickToUnblockAudio);
    return () => {
      window.removeEventListener('click', handleGlobalClickToUnblockAudio);
    };
  }, []);

  // 4. Initialize Local Media Stream (with graceful camera fallback)
  const initLocalStream = useCallback(async () => {
    if (isStreamInitializedRef.current && localStreamRef.current) {
      return localStreamRef.current;
    }

    let stream: MediaStream | null = null;
    let cameraWorking = true;

    try {
      // First attempt: Request both audio and video
      stream = await navigator.mediaDevices.getUserMedia({
        audio: getAudioConstraints(),
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
    } catch (err: any) {
      console.warn('Không thể bật camera, thử chuyển sang chỉ dùng microphone:', err);
      try {
        // Fallback: Audio only if video is not available
        stream = await navigator.mediaDevices.getUserMedia({
          audio: getAudioConstraints(),
          video: false,
        });
        cameraWorking = false;
        setHasCamera(false);
        setIsCameraOff(true);
        if (!isStreamInitializedRef.current) {
          info('Thiết bị không có camera hoặc quyền video bị từ chối. Phòng họp hoạt động ở chế độ âm thanh.');
        }
      } catch (audioErr: any) {
        console.error('Không thể lấy microphone:', audioErr);
        error('Không thể kết nối micro. Vui lòng cấp quyền truy cập microphone trong trình duyệt.');
        return null;
      }
    }

    isStreamInitializedRef.current = true;
    localStreamRef.current = stream;
    setHasCamera(cameraWorking);

    if (localVideoRef.current && cameraWorking) {
      localVideoRef.current.srcObject = stream;
    }

    setupAudioDetection(stream);
    void enumerateAudioDevices();
    return stream;
  }, [error, info, enumerateAudioDevices, setupAudioDetection]);

  // Helper to drain pending ICE candidates
  const drainIceCandidates = (socketId: string, pc: RTCPeerConnection) => {
    const queued = pendingIceCandidatesRef.current[socketId] || [];
    for (const cand of queued) {
      try {
        pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn('Lỗi khi nạp queued ICE candidate', err);
      }
    }
    delete pendingIceCandidatesRef.current[socketId];
  };

  // 5. WebRTC Peer Connection Helper
  const createPeerConnection = useCallback(
    (targetSocketId: string) => {
      if (peersRef.current[targetSocketId]) {
        try {
          peersRef.current[targetSocketId].close();
        } catch {
          // Ignore
        }
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peersRef.current[targetSocketId] = pc;

      // Add local tracks to peer connection
      // If screen sharing is active, prioritize screen sharing video track
      if (screenTrackRef.current && screenTrackRef.current.readyState === 'live') {
        const displayStream = displayStreamRef.current || new MediaStream([screenTrackRef.current]);
        pc.addTrack(screenTrackRef.current, displayStream);
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack && localStreamRef.current) {
          pc.addTrack(audioTrack, localStreamRef.current);
        }
      } else if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Prioritize audio sender packets in network scheduler
      const audioSender = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (audioSender) {
        try {
          const params = audioSender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            params.encodings[0].maxBitrate = 64000;
            params.encodings[0].networkPriority = 'high';
            params.encodings[0].priority = 'high';
            void audioSender.setParameters(params);
          }
        } catch {
          // Ignore
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
        }
      };

      // Handle ICE candidate
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('ice-candidate', {
            toSocketId: targetSocketId,
            candidate: event.candidate,
          });
        }
      };

      // Handle remote track received
      pc.ontrack = (event) => {
        const track = event.track;

        // Apply 50ms playoutDelayHint to audio receiver to smooth out packet jitter without crackling
        pc.getReceivers().forEach((receiver) => {
          if (receiver.track?.kind === 'audio') {
            if ('playoutDelayHint' in receiver) {
              (receiver as any).playoutDelayHint = 0.05;
            }
            if ('jitterBufferDelayHint' in receiver) {
              (receiver as any).jitterBufferDelayHint = 0.05;
            }
          }
        });

        // 1. Dedicated Audio Pipeline: isolate audio from video/screen share changes
        if (track.kind === 'audio') {
          let audioStream = remoteAudioStreamsRef.current.get(targetSocketId);
          if (!audioStream) {
            audioStream = new MediaStream();
            remoteAudioStreamsRef.current.set(targetSocketId, audioStream);
          }
          audioStream.getAudioTracks().forEach((t) => audioStream!.removeTrack(t));
          audioStream.addTrack(track);

          let audioEl = remoteAudioElementsRef.current.get(targetSocketId);
          if (!audioEl) {
            audioEl = new Audio();
            audioEl.autoplay = true;
            (audioEl as any).playsInline = true;
            remoteAudioElementsRef.current.set(targetSocketId, audioEl);
          }

          if (audioEl.srcObject !== audioStream) {
            audioEl.srcObject = audioStream;
          }

          if (selectedSpeakerIdRef.current && 'setSinkId' in audioEl) {
            (audioEl as any).setSinkId(selectedSpeakerIdRef.current).catch(() => {});
          }

          audioEl.play().catch((err) => {
            console.warn('Autoplay prevented by browser:', err);
            setAudioAutoplayBlocked(true);
          });

          track.onunmute = () => {
            audioEl?.play().catch(() => {});
          };

          // Setup speaking detection for remote participant
          setupRemoteAudioDetection(targetSocketId, audioStream);
        }

        // 2. Combined Stream for Video & Screen Presentation Tiles
        let combinedStream = remoteCombinedStreamsRef.current.get(targetSocketId);
        if (!combinedStream) {
          combinedStream = new MediaStream();
          remoteCombinedStreamsRef.current.set(targetSocketId, combinedStream);
        }

        if (track.kind === 'video') {
          combinedStream.getVideoTracks().forEach((t) => combinedStream!.removeTrack(t));
          combinedStream.addTrack(track);
        } else if (track.kind === 'audio') {
          combinedStream.getAudioTracks().forEach((t) => combinedStream!.removeTrack(t));
          combinedStream.addTrack(track);
        }

        setRemotePeers((prev) => {
          const peer = prev[targetSocketId];
          if (!peer) {
            return {
              ...prev,
              [targetSocketId]: {
                socketId: targetSocketId,
                userId: '',
                userName: 'Thành viên',
                userRole: 'CANDIDATE',
                hasVideo: combinedStream!.getVideoTracks().length > 0,
                hasAudio: combinedStream!.getAudioTracks().length > 0,
                isMuted: false,
                isCameraOff: combinedStream!.getVideoTracks().length === 0,
                isScreenSharing: false,
                stream: combinedStream,
              },
            };
          }
          return {
            ...prev,
            [targetSocketId]: {
              ...peer,
              stream: combinedStream,
              hasVideo: combinedStream!.getVideoTracks().length > 0,
              hasAudio: combinedStream!.getAudioTracks().length > 0,
            },
          };
        });
      };

      return pc;
    },
    [setupRemoteAudioDetection],
  );

  // 6. Connect Socket & Join Room
  useEffect(() => {
    if (!roomId || !user?._id || !round?._id) return;

    let socket: any = null;

    initLocalStream().then((stream) => {
      if (!stream) return;

      socket = getInterviewRoomSocket();
      socketRef.current = socket;

      const handleConnect = () => {
        socket.emit('join-room', {
          roomId,
          userId: user._id,
          userName: user.name,
          userRole: userRoleInRoomRef.current,
          hasVideo: stream.getVideoTracks().length > 0,
          hasAudio: stream.getAudioTracks().length > 0,
        });
      };

      if (socket.connected) {
        handleConnect();
      } else {
        socket.on('connect', handleConnect);
      }

      // Receive existing participants list when joined
      socket.on('room-users', async ({ participants }: { participants: any[] }) => {
        const peersMap: { [socketId: string]: PeerInfo } = {};

        for (const p of participants) {
          peersMap[p.socketId] = p;
          const pc = createPeerConnection(p.socketId);

          if (p.isScreenSharing) {
            setPinnedId(p.socketId);
          }

          // Initiate offer to existing participant
          try {
            const offer = await pc.createOffer();
            const tunedOffer = new RTCSessionDescription({
              type: offer.type,
              sdp: tuneOpusSdp(offer.sdp || ''),
            });
            await pc.setLocalDescription(tunedOffer);
            socket.emit('offer', {
              toSocketId: p.socketId,
              offer: tunedOffer,
              fromUser: {
                userId: user._id,
                userName: user.name,
                userRole: userRoleInRoomRef.current,
              },
            });
          } catch (err) {
            console.error('Lỗi khi tạo offer WebRTC', err);
          }
        }

        setRemotePeers(peersMap);
      });

      // Another user joined
      socket.on('user-joined', ({ participant }: { participant: any }) => {
        setRemotePeers((prev) => ({
          ...prev,
          [participant.socketId]: participant,
        }));
      });

      // Receive offer
      socket.on('offer', async ({ fromSocketId, offer, fromUser }: any) => {
        let pc = peersRef.current[fromSocketId];
        if (!pc) {
          pc = createPeerConnection(fromSocketId);
        }

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          drainIceCandidates(fromSocketId, pc);

          const answer = await pc.createAnswer();
          const tunedAnswer = new RTCSessionDescription({
            type: answer.type,
            sdp: tuneOpusSdp(answer.sdp || ''),
          });
          await pc.setLocalDescription(tunedAnswer);

          socket.emit('answer', {
            toSocketId: fromSocketId,
            answer: tunedAnswer,
          });

          setRemotePeers((prev) => {
            const existing = prev[fromSocketId];
            return {
              ...prev,
              [fromSocketId]: {
                socketId: fromSocketId,
                userId: fromUser.userId,
                userName: fromUser.userName,
                userRole: fromUser.userRole || 'CANDIDATE',
                hasVideo: existing?.hasVideo ?? true,
                hasAudio: existing?.hasAudio ?? true,
                isMuted: existing?.isMuted ?? false,
                isCameraOff: existing?.isCameraOff ?? false,
                isScreenSharing: existing?.isScreenSharing ?? false,
                stream: existing?.stream,
              },
            };
          });
        } catch (err) {
          console.error('Lỗi khi xử lý offer', err);
        }
      });

      // Receive answer
      socket.on('answer', async ({ fromSocketId, answer }: any) => {
        const pc = peersRef.current[fromSocketId];
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            drainIceCandidates(fromSocketId, pc);
          } catch (err) {
            console.error('Lỗi khi xử lý answer', err);
          }
        }
      });

      // Receive ICE candidate
      socket.on('ice-candidate', async ({ fromSocketId, candidate }: any) => {
        if (!candidate) return;
        const pc = peersRef.current[fromSocketId];
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('Lỗi khi thêm ICE candidate', err);
          }
        } else {
          if (!pendingIceCandidatesRef.current[fromSocketId]) {
            pendingIceCandidatesRef.current[fromSocketId] = [];
          }
          pendingIceCandidatesRef.current[fromSocketId].push(candidate);
        }
      });

      // Remote user media toggled
      socket.on('user-media-toggled', ({ socketId, isMuted, isCameraOff, isScreenSharing }: any) => {
        if (isScreenSharing === true) {
          setPinnedId(socketId);
        } else if (isScreenSharing === false) {
          setPinnedId((prev) => (prev === socketId ? null : prev));
        }

        setRemotePeers((prev) => {
          const peer = prev[socketId];
          if (!peer) return prev;
          return {
            ...prev,
            [socketId]: {
              ...peer,
              isMuted: isMuted !== undefined ? isMuted : peer.isMuted,
              isCameraOff: isCameraOff !== undefined ? isCameraOff : peer.isCameraOff,
              isScreenSharing: isScreenSharing !== undefined ? isScreenSharing : peer.isScreenSharing,
            },
          };
        });
      });

      // In-room chat message
      socket.on('chat-message', (chatMsg: ChatMessage) => {
        setChatMessages((prev) => [...prev, chatMsg]);
        if (!isChatOpenRef.current) {
          setUnreadChatCount((prev) => prev + 1);
        }
      });

      // User left
      socket.on('user-left', ({ socketId }: any) => {
        if (peersRef.current[socketId]) {
          peersRef.current[socketId].close();
          delete peersRef.current[socketId];
        }
        cleanupRemoteAudioDetection(socketId);
        const audioEl = remoteAudioElementsRef.current.get(socketId);
        if (audioEl) {
          audioEl.pause();
          audioEl.srcObject = null;
          remoteAudioElementsRef.current.delete(socketId);
        }
        remoteAudioStreamsRef.current.delete(socketId);
        remoteCombinedStreamsRef.current.delete(socketId);

        setPinnedId((prev) => (prev === socketId ? null : prev));
        setRemotePeers((prev) => {
          const clone = { ...prev };
          delete clone[socketId];
          return clone;
        });
      });

      // Room ended by HR
      socket.on('room-ended', ({ endedBy, message }: any) => {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => track.stop());
        }
        if (screenTrackRef.current) {
          screenTrackRef.current.stop();
        }
        cleanupAudioDetection();
        cleanupRemoteAudioDetection();
        remoteAudioElementsRef.current.forEach((el) => {
          el.pause();
          el.srcObject = null;
        });
        remoteAudioElementsRef.current.clear();
        remoteAudioStreamsRef.current.clear();
        remoteCombinedStreamsRef.current.clear();

        Object.values(peersRef.current).forEach((pc) => pc.close());
        peersRef.current = {};

        setMeetingEndedData({
          endedBy: endedBy || 'Người phỏng vấn (HR)',
          message: message || 'Buổi phỏng vấn đã được người phỏng vấn kết thúc.',
        });
        setIsMeetingEndedModalOpen(true);
      });
    });

    return () => {
      cleanupAudioDetection();
      cleanupRemoteAudioDetection();

      // Pause and release all remote audio elements
      remoteAudioElementsRef.current.forEach((el) => {
        el.pause();
        el.srcObject = null;
      });
      remoteAudioElementsRef.current.clear();
      remoteAudioStreamsRef.current.clear();
      remoteCombinedStreamsRef.current.clear();

      if (screenTrackRef.current) {
        screenTrackRef.current.onended = null;
        screenTrackRef.current.stop();
        screenTrackRef.current = null;
      }
      displayStreamRef.current = null;

      // Cleanup
      if (socket) {
        socket.emit('leave-room');
        socket.off('room-users');
        socket.off('user-joined');
        socket.off('offer');
        socket.off('answer');
        socket.off('ice-candidate');
        socket.off('user-media-toggled');
        socket.off('chat-message');
        socket.off('user-left');
        socket.off('room-ended');
      }

      // Stop local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
        isStreamInitializedRef.current = false;
      }

      // Close all peer connections
      Object.values(peersRef.current).forEach((pc) => pc.close());
      peersRef.current = {};
    };
  }, [
    roomId,
    user?._id,
    round?._id,
    initLocalStream,
    createPeerConnection,
    cleanupAudioDetection,
    cleanupRemoteAudioDetection,
  ]);

  // Helper to renegotiate SDP offers when tracks change (e.g. screen sharing added/removed)
  const renegotiateWithPeers = useCallback(async () => {
    if (!socketRef.current) return;
    for (const [targetSocketId, pc] of Object.entries(peersRef.current)) {
      try {
        const offer = await pc.createOffer();
        const tunedOffer = new RTCSessionDescription({
          type: offer.type,
          sdp: tuneOpusSdp(offer.sdp || ''),
        });
        await pc.setLocalDescription(tunedOffer);
        socketRef.current.emit('offer', {
          toSocketId: targetSocketId,
          offer: tunedOffer,
          fromUser: {
            userId: userRef.current?._id,
            userName: userRef.current?.name,
            userRole: userRoleInRoomRef.current,
          },
        });
      } catch (err) {
        console.warn('Lỗi khi tái đàm phán WebRTC', err);
      }
    }
  }, []);

  // Stop screen sharing cleanly
  const stopScreenSharing = useCallback(async () => {
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }
    displayStreamRef.current = null;

    setIsScreenSharing(false);
    setPinnedId((prev) => (prev === 'local' ? null : prev));

    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;

    for (const [, pc] of Object.entries(peersRef.current)) {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) {
        if (cameraTrack) {
          await sender.replaceTrack(cameraTrack);
        } else {
          try {
            pc.removeTrack(sender);
          } catch {
            await sender.replaceTrack(null);
          }
        }
      }
    }

    await renegotiateWithPeers();

    if (localVideoRef.current && localStreamRef.current && hasCameraRef.current && !isCameraOffRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }

    if (socketRef.current) {
      socketRef.current.emit('toggle-media', {
        isScreenSharing: false,
      });
    }
  }, [renegotiateWithPeers]);

  // Toggle Microphone
  const handleToggleMic = () => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const nextMuted = !isMicMuted;
      audioTrack.enabled = !nextMuted;
      setIsMicMuted(nextMuted);

      if (socketRef.current) {
        socketRef.current.emit('toggle-media', {
          isMuted: nextMuted,
          isScreenSharing: isScreenSharingRef.current,
        });
      }
    }
  };

  // Toggle Camera
  const handleToggleCamera = () => {
    if (!hasCamera) {
      info('Thiết bị của bạn không có camera');
      return;
    }
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      const nextOff = !isCameraOff;
      videoTrack.enabled = !nextOff;
      setIsCameraOff(nextOff);

      if (socketRef.current) {
        socketRef.current.emit('toggle-media', {
          isCameraOff: nextOff,
          isScreenSharing: isScreenSharingRef.current,
        });
      }
    }
  };

  // Screen Share Toggle
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      await stopScreenSharing();
    } else {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        const screenTrack = displayStream.getVideoTracks()[0];
        if (!screenTrack) return;

        screenTrackRef.current = screenTrack;
        displayStreamRef.current = displayStream;

        // Replace track on existing video sender, or addTrack if peer had no video sender
        for (const [, pc] of Object.entries(peersRef.current)) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(screenTrack);
          } else {
            pc.addTrack(screenTrack, displayStream);
          }
        }

        await renegotiateWithPeers();

        setIsScreenSharing(true);
        setPinnedId('local');
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = displayStream;
        }

        if (socketRef.current) {
          socketRef.current.emit('toggle-media', {
            isScreenSharing: true,
          });
        }

        screenTrack.onended = () => {
          void stopScreenSharing();
        };
      } catch (err: any) {
        if (err.name !== 'NotAllowedError') {
          console.warn('Hủy chia sẻ màn hình', err);
        }
      }
    }
  };

  // Send Chat message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !socketRef.current || !roomId) return;

    socketRef.current.emit('chat-message', {
      roomId,
      message: chatInput.trim(),
      senderName: user?.name || 'Thành viên',
      senderRole: userRoleInRoom,
    });
    setChatInput('');
  };

  // Redirect countdown when meeting room error happens (closed / doesn't exist)
  useEffect(() => {
    if (errorMessage) {
      const timer = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            handleLeaveRoom();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [errorMessage]);

  // HR ends meeting room for all participants
  const handleEndMeetingForAll = async () => {
    if (!roomId || !accessToken) return;
    try {
      setIsEndingMeeting(true);
      await employerApi.endInterviewRoom(roomId, accessToken);
      if (socketRef.current) {
        socketRef.current.emit('end-room', { roomId });
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (screenTrackRef.current) {
        screenTrackRef.current.stop();
      }
      cleanupAudioDetection();
      navigate('/dashboard?tab=calendar');
    } catch (err: any) {
      console.error('Lỗi khi kết thúc cuộc họp:', err);
      error(err?.message || 'Không thể kết thúc cuộc họp.');
      setIsEndingMeeting(false);
      setIsEndMeetingDialogOpen(false);
    }
  };

  // Leave room
  const handleLeaveRoom = () => {
    if (userRoleInRoom === 'INTERVIEWER') {
      navigate('/dashboard?tab=calendar');
    } else {
      navigate('/candidate/applied-jobs');
    }
  };

  const remotePeerList = Object.values(remotePeers);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 text-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        <p className="mt-4 text-sm font-medium text-slate-400">
          Đang khởi tạo phòng phỏng vấn trực tuyến...
        </p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-white">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 mb-4">
          <AlertCircle className="h-8 w-8" />
        </div>
        <h2 className="text-xl font-bold">Phòng phỏng vấn không khả dụng</h2>
        <p className="mt-2 max-w-md text-sm text-slate-400">{errorMessage}</p>
        <p className="mt-2 text-xs text-slate-500">
          Hệ thống sẽ tự động chuyển hướng về trang chủ sau <span className="text-primary font-bold">{redirectCountdown}s</span>...
        </p>
        <button
          onClick={handleLeaveRoom}
          className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark cursor-pointer"
        >
          Quay lại trang chủ ngay
        </button>
      </div>
    );
  }

  // Render Local User Tile
  const renderLocalTile = (isThumbnail = false) => {
    const isPinned = pinnedId === 'local';

    return (
      <div
        key="local-tile"
        onClick={() => {
          if (isThumbnail) setPinnedId('local');
        }}
        className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-3xl border transition-all ${
          isThumbnail ? 'cursor-pointer hover:border-primary/50' : ''
        } ${
          isPinned
            ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-slate-950 shadow-2xl'
            : isLocalSpeaking
            ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-slate-950'
            : 'border-slate-800'
        } bg-slate-900 shadow-xl ${
          !isThumbnail && isScreenSharing && !pinnedId
            ? 'lg:col-span-2 min-h-[420px] md:min-h-[500px]'
            : !isThumbnail
            ? 'min-h-[260px]'
            : ''
        }`}
      >
        {/* Pin / Unpin Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setPinnedId(isPinned ? null : 'local');
          }}
          className={`absolute top-3 right-3 z-10 flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur-md transition cursor-pointer ${
            isPinned
              ? 'bg-primary text-white shadow-md shadow-primary/30 ring-1 ring-white/20'
              : 'bg-slate-950/70 text-slate-300 hover:bg-slate-900 hover:text-white border border-slate-700/50'
          }`}
          title={isPinned ? 'Bỏ ghim khỏi màn hình chính' : 'Ghim lên màn hình chính'}
        >
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          {!isThumbnail && <span>{isPinned ? 'Bỏ ghim' : 'Ghim'}</span>}
        </button>

        {/* Video or Fallback Avatar */}
        {(hasCamera && !isCameraOff) || isScreenSharing ? (
          <video
            autoPlay
            playsInline
            muted
            ref={(el) => {
              localVideoRef.current = el;
              if (el) {
                const targetStream = isScreenSharing
                  ? (displayStreamRef.current || (screenTrackRef.current ? new MediaStream([screenTrackRef.current]) : null))
                  : (hasCamera && !isCameraOff ? localStreamRef.current : null);
                if (targetStream && el.srcObject !== targetStream) {
                  el.srcObject = targetStream;
                }
                if (el.paused) {
                  el.play().catch(() => {});
                }
              }
            }}
            className={`h-full w-full ${
              isScreenSharing
                ? 'object-contain bg-black'
                : 'object-cover transform -scale-x-100'
            }`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <div
              className={`flex items-center justify-center rounded-full bg-slate-800 border-2 border-slate-700 text-slate-300 font-extrabold uppercase ${
                isThumbnail ? 'h-12 w-12 text-sm' : 'h-24 w-24 text-2xl'
              }`}
            >
              {user?.name?.slice(0, 2) || 'Tôi'}
            </div>
            {!isThumbnail && (
              <>
                <span className="mt-3 text-sm font-bold text-white">
                  {user?.name || 'Bạn'} (Tôi)
                </span>
                <span className="text-[11px] text-slate-400">
                  {hasCamera ? 'Camera đã tắt' : 'Thiết bị không có camera'}
                </span>
              </>
            )}
          </div>
        )}

        {/* Local Badge */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl bg-slate-950/75 px-3 py-1.5 backdrop-blur-md">
          <span className={`${isThumbnail ? 'text-[10px]' : 'text-xs'} font-semibold text-white flex items-center gap-1.5`}>
            {user?.name || 'Bạn'} (Tôi)
            {isScreenSharing ? ' • Đang chia sẻ màn hình' : ''}
            {isPinned && !isThumbnail ? ' • Đã ghim' : ''}
            {isLocalSpeaking && !isMicMuted && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Đang nói
              </span>
            )}
          </span>
          {isMicMuted ? (
            <MicOff className="h-3.5 w-3.5 text-rose-400" />
          ) : (
            <Mic className="h-3.5 w-3.5 text-emerald-400" />
          )}
        </div>

        {/* Waiting for other participant banner */}
        {!isThumbnail && remotePeerList.length === 0 && !isScreenSharing && (
          <div className="absolute top-4 inset-x-4 mx-auto max-w-sm rounded-xl bg-slate-950/80 p-3 text-center border border-slate-800 backdrop-blur-md">
            <p className="text-xs font-medium text-slate-300">
              Đang chờ người tham gia còn lại vào phòng...
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Đảm bảo micro hoạt động rõ ràng để trao đổi phỏng vấn.
            </p>
          </div>
        )}
      </div>
    );
  };

  // Render Remote Participant Tile
  const renderRemoteTile = (peer: PeerInfo, isThumbnail = false) => {
    const hasVideoTrack = peer.stream && peer.stream.getVideoTracks().length > 0;
    const showVideo = hasVideoTrack && (!peer.isCameraOff || peer.isScreenSharing);
    const isThisPeerScreenSharing = Boolean(peer.isScreenSharing);
    const isPinned = pinnedId === peer.socketId;

    return (
      <div
        key={peer.socketId}
        onClick={() => {
          if (isThumbnail) setPinnedId(peer.socketId);
        }}
        className={`relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-3xl border transition-all ${
          isThumbnail ? 'cursor-pointer hover:border-primary/50' : ''
        } ${
          isPinned
            ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-slate-950 shadow-2xl'
            : peer.isSpeaking
            ? 'border-emerald-500 ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-950 shadow-emerald-500/20 shadow-lg'
            : 'border-slate-800'
        } bg-slate-900 shadow-xl ${
          !isThumbnail && isThisPeerScreenSharing && !pinnedId
            ? 'lg:col-span-2 min-h-[420px] md:min-h-[500px]'
            : !isThumbnail
            ? 'min-h-[260px]'
            : ''
        }`}
      >
        {/* Pin / Unpin Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setPinnedId(isPinned ? null : peer.socketId);
          }}
          className={`absolute top-3 right-3 z-10 flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur-md transition cursor-pointer ${
            isPinned
              ? 'bg-primary text-white shadow-md shadow-primary/30 ring-1 ring-white/20'
              : 'bg-slate-950/70 text-slate-300 hover:bg-slate-900 hover:text-white border border-slate-700/50'
          }`}
          title={isPinned ? 'Bỏ ghim khỏi màn hình chính' : 'Ghim lên màn hình chính'}
        >
          {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          {!isThumbnail && <span>{isPinned ? 'Bỏ ghim' : 'Ghim'}</span>}
        </button>

        {/* Video or Fallback Avatar */}
        {showVideo ? (
          <video
            autoPlay
            playsInline
            muted
            ref={(el) => {
              if (el && peer.stream) {
                if (el.srcObject !== peer.stream) {
                  el.srcObject = peer.stream;
                }
                if (el.paused) {
                  el.play().catch(() => {});
                }
              }
            }}
            className={`h-full w-full ${
              isThisPeerScreenSharing ? 'object-contain bg-black' : 'object-cover'
            }`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <div
              className={`flex items-center justify-center rounded-full bg-primary/20 border-2 border-primary/40 text-primary font-extrabold uppercase shadow-inner ${
                isThumbnail ? 'h-12 w-12 text-sm' : 'h-24 w-24 text-2xl'
              }`}
            >
              {peer.userName.slice(0, 2)}
            </div>
            {!isThumbnail && (
              <>
                <span className="mt-3 text-sm font-bold text-white">{peer.userName}</span>
                <span className="text-[11px] text-slate-400">
                  {peer.userRole === 'INTERVIEWER' ? 'Người phỏng vấn (HR)' : 'Ứng viên'} • Camera tắt
                </span>
              </>
            )}
          </div>
        )}

        {/* Participant overlay badge */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-xl bg-slate-950/75 px-3 py-1.5 backdrop-blur-md">
          <span className={`${isThumbnail ? 'text-[10px]' : 'text-xs'} font-semibold text-white flex items-center gap-1.5`}>
            {peer.userName} ({peer.userRole === 'INTERVIEWER' ? 'HR' : 'Ứng viên'})
            {isThisPeerScreenSharing ? ' • Đang chia sẻ màn hình' : ''}
            {isPinned && !isThumbnail ? ' • Đã ghim' : ''}
            {peer.isSpeaking && !peer.isMuted && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                Đang nói
              </span>
            )}
          </span>
          {peer.isMuted ? (
            <MicOff className="h-3.5 w-3.5 text-rose-400" />
          ) : (
            <Mic className="h-3.5 w-3.5 text-emerald-400" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* ========================================================================= */}
      {/* 1. TOP BAR (Meeting info & Status)                                        */}
      {/* ========================================================================= */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/90 px-6 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <VideoIcon className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-white line-clamp-1">
              {round?.title || 'Phòng phỏng vấn trực tuyến'}
            </h1>
            <p className="text-[11px] text-slate-400">
              {round?.application?.job?.name} • {round?.application?.company?.name || round?.company?.name || 'TalentPulse'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Duration Counter */}
          <div className="flex items-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-mono text-slate-300 border border-slate-700">
            <Clock className="h-3.5 w-3.5 text-emerald-400" />
            <span>{formatDuration(callDuration)}</span>
          </div>

          {/* Secure indicator */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
            <ShieldCheck className="h-4 w-4" />
            <span>Kết nối mã hóa WebRTC</span>
          </div>
        </div>
      </header>

      {/* Audio Autoplay Unblock Banner */}
      {audioAutoplayBlocked && (
        <div className="bg-amber-500 text-slate-950 px-4 py-2 text-center text-xs font-bold flex items-center justify-center gap-3 z-30 shadow-lg">
          <VolumeX className="h-4 w-4 shrink-0" />
          <span>Trình duyệt đang chặn âm thanh tự động của phòng họp.</span>
          <button
            onClick={handleUnlockAudio}
            className="rounded-lg bg-slate-950 text-white px-3 py-1 text-[11px] font-bold hover:bg-slate-800 transition cursor-pointer"
          >
            Bấm để mở âm thanh ngay
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MAIN VIDEO GRID / SPOTLIGHT (Zoom & Google Meet Layout)                */}
      {/* ========================================================================= */}
      <main className="relative flex-1 p-4 flex items-center justify-center overflow-hidden">
        {(() => {
          const isAnyScreenSharing =
            isScreenSharing || remotePeerList.some((p) => p.isScreenSharing);

          if (pinnedId !== null) {
            // SPOTLIGHT VIEW: Pinned Hero on main stage + Filmstrip
            const pinnedPeer = remotePeerList.find((p) => p.socketId === pinnedId);
            const isLocalPinned = pinnedId === 'local';

            return (
              <div className="flex h-full w-full max-w-7xl mx-auto flex-col md:flex-row gap-4 overflow-hidden">
                {/* Main Hero Stage */}
                <div className="flex-1 flex items-center justify-center h-full min-h-[360px] md:min-h-[500px] overflow-hidden">
                  {isLocalPinned
                    ? renderLocalTile(false)
                    : pinnedPeer
                    ? renderRemoteTile(pinnedPeer, false)
                    : renderLocalTile(false)}
                </div>

                {/* Filmstrip Side/Top Container */}
                <div className="flex flex-row md:flex-col gap-3 shrink-0 w-full md:w-64 max-h-40 md:max-h-full overflow-x-auto md:overflow-y-auto pb-2 md:pb-0">
                  {!isLocalPinned && (
                    <div className="w-48 md:w-full h-32 md:h-40 shrink-0">
                      {renderLocalTile(true)}
                    </div>
                  )}
                  {remotePeerList
                    .filter((p) => p.socketId !== pinnedId)
                    .map((peer) => (
                      <div key={peer.socketId} className="w-48 md:w-full h-32 md:h-40 shrink-0">
                        {renderRemoteTile(peer, true)}
                      </div>
                    ))}
                </div>
              </div>
            );
          }

          // STANDARD GRID VIEW
          return (
            <div
              className={`grid h-full w-full gap-4 max-w-7xl mx-auto transition-all ${
                isAnyScreenSharing
                  ? 'grid-cols-1 lg:grid-cols-3'
                  : remotePeerList.length === 0
                  ? 'grid-cols-1'
                  : remotePeerList.length === 1
                  ? 'grid-cols-1 md:grid-cols-2'
                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
              }`}
            >
              {remotePeerList.map((peer) => renderRemoteTile(peer, false))}
              {renderLocalTile(false)}
            </div>
          );
        })()}

        {/* ========================================================================= */}
        {/* IN-ROOM CHAT DRAWER                                                       */}
        {/* ========================================================================= */}
        {isChatOpen && (
          <aside className="absolute right-4 top-4 bottom-4 z-30 flex w-80 flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 p-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold text-white">Tin nhắn trong phòng</h3>
              </div>
              <button
                onClick={() => setIsChatOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
              {chatMessages.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Chưa có tin nhắn nào. Bạn có thể gửi ghi chú hoặc liên kết tại đây.
                </p>
              ) : (
                chatMessages.map((msg, idx) => {
                  const isMe = msg.senderName === user?.name;
                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[10px] text-slate-400 mb-0.5">
                        {msg.senderName} ({msg.senderRole === 'INTERVIEWER' ? 'HR' : 'Ứng viên'})
                      </span>
                      <div
                        className={`rounded-xl px-3 py-2 max-w-[85%] text-xs ${
                          isMe
                            ? 'bg-primary text-white rounded-br-xs'
                            : 'bg-slate-800 text-slate-100 rounded-bl-xs'
                        }`}
                      >
                        {msg.message}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Nhập tin nhắn..."
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-hidden"
              />
              <button
                type="submit"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-white hover:bg-primary-dark transition cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
          </aside>
        )}

        {/* ========================================================================= */}
        {/* PARTICIPANTS DRAWER                                                       */}
        {/* ========================================================================= */}
        {isParticipantsOpen && (
          <aside className="absolute right-4 top-4 bottom-4 z-30 flex w-72 flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold text-white">
                  Người tham gia ({remotePeerList.length + 1})
                </h3>
              </div>
              <button
                onClick={() => setIsParticipantsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs">
              {/* Local user */}
              <div className="flex items-center justify-between rounded-xl bg-slate-800/60 p-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">
                    {user?.name?.slice(0, 2) || 'T'}
                  </div>
                  <div>
                    <p className="font-bold text-white">{user?.name} (Bạn)</p>
                    <p className="text-[10px] text-slate-400">
                      {userRoleInRoom === 'INTERVIEWER' ? 'Người phỏng vấn' : 'Ứng viên'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-slate-400">
                  {isMicMuted ? (
                    <MicOff className="h-3.5 w-3.5 text-rose-400" />
                  ) : (
                    <Mic className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                </div>
              </div>

              {/* Remote users */}
              {remotePeerList.map((p) => (
                <div
                  key={p.socketId}
                  className="flex items-center justify-between rounded-xl bg-slate-800/40 p-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-slate-200 text-xs font-bold">
                      {p.userName.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-bold text-white">{p.userName}</p>
                      <p className="text-[10px] text-slate-400">
                        {p.userRole === 'INTERVIEWER' ? 'Người phỏng vấn' : 'Ứng viên'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    {p.isMuted ? (
                      <MicOff className="h-3.5 w-3.5 text-rose-400" />
                    ) : (
                      <Mic className="h-3.5 w-3.5 text-emerald-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </main>

      {/* ========================================================================= */}
      {/* 3. BOTTOM FLOATING CONTROL DOCK (Zoom-style)                              */}
      {/* ========================================================================= */}
      <footer className="flex h-20 shrink-0 items-center justify-center border-t border-slate-800/80 bg-slate-900/95 px-6 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          {/* Zoom-like Mic Toggle & Audio Settings Dropdown */}
          <div className="relative flex items-center rounded-2xl bg-slate-800 shadow-md">
            <button
              onClick={handleToggleMic}
              className={`flex flex-col items-center justify-center h-12 w-12 rounded-l-2xl text-xs font-semibold transition cursor-pointer ${
                isMicMuted
                  ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                  : 'text-white hover:bg-slate-700'
              }`}
              title={isMicMuted ? 'Bật microphone' : 'Tắt microphone'}
            >
              {isMicMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-emerald-400" />}
              <span className="text-[9px] mt-0.5">{isMicMuted ? 'Tắt mic' : 'Bật mic'}</span>
            </button>
            <button
              onClick={() => setIsAudioSettingsOpen(!isAudioSettingsOpen)}
              className={`flex items-center justify-center h-12 px-1.5 rounded-r-2xl border-l border-slate-700 transition cursor-pointer ${
                isAudioSettingsOpen
                  ? 'bg-primary/20 text-primary'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
              title="Cài đặt Âm thanh (Micro, Loa / Tai nghe)"
            >
              <ChevronUp className={`h-3.5 w-3.5 transition-transform ${isAudioSettingsOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Camera Toggle */}
          <button
            onClick={handleToggleCamera}
            disabled={!hasCamera}
            className={`flex flex-col items-center justify-center h-12 w-14 rounded-2xl text-xs font-semibold transition cursor-pointer ${
              !hasCamera
                ? 'opacity-40 bg-slate-800 text-slate-500 cursor-not-allowed'
                : isCameraOff
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30'
                : 'bg-slate-800 text-white hover:bg-slate-700'
            }`}
            title={!hasCamera ? 'Không có camera' : isCameraOff ? 'Bật camera' : 'Tắt camera'}
          >
            {isCameraOff || !hasCamera ? (
              <VideoOff className="h-5 w-5" />
            ) : (
              <VideoIcon className="h-5 w-5 text-primary" />
            )}
            <span className="text-[9px] mt-0.5">{isCameraOff ? 'Tắt cam' : 'Bật cam'}</span>
          </button>

          {/* Screen Share */}
          <button
            onClick={handleToggleScreenShare}
            className={`hidden sm:flex flex-col items-center justify-center h-12 w-16 rounded-2xl text-xs font-semibold transition cursor-pointer ${
              isScreenSharing
                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title={isScreenSharing ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình'}
          >
            <Share2 className="h-5 w-5" />
            <span className="text-[9px] mt-0.5">Chia sẻ</span>
          </button>

          {/* Participants */}
          <button
            onClick={() => {
              setIsParticipantsOpen(!isParticipantsOpen);
              setIsChatOpen(false);
              setIsAudioSettingsOpen(false);
            }}
            className={`flex flex-col items-center justify-center h-12 w-14 rounded-2xl text-xs font-semibold transition cursor-pointer ${
              isParticipantsOpen
                ? 'bg-primary/20 text-primary'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Users className="h-5 w-5" />
            <span className="text-[9px] mt-0.5">Thành viên</span>
          </button>

          {/* In-room Chat */}
          <button
            onClick={() => {
              setIsChatOpen(!isChatOpen);
              setIsParticipantsOpen(false);
              setIsAudioSettingsOpen(false);
              setUnreadChatCount(0);
            }}
            className={`relative flex flex-col items-center justify-center h-12 w-14 rounded-2xl text-xs font-semibold transition cursor-pointer ${
              isChatOpen
                ? 'bg-primary/20 text-primary'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <MessageSquare className="h-5 w-5" />
            <span className="text-[9px] mt-0.5">Trò chuyện</span>
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* End / Leave Meeting Button (Red) */}
          <button
            onClick={() => {
              if (userRoleInRoom === 'INTERVIEWER') {
                setIsEndMeetingDialogOpen(true);
              } else {
                handleLeaveRoom();
              }
            }}
            className="ml-4 flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition hover:bg-rose-700 active:scale-95 cursor-pointer"
            title={userRoleInRoom === 'INTERVIEWER' ? 'Kết thúc hoặc rời phòng phỏng vấn' : 'Rời phòng phỏng vấn'}
          >
            <PhoneOff className="h-4 w-4" />
            <span>{userRoleInRoom === 'INTERVIEWER' ? 'Kết thúc / Rời phòng' : 'Rời phòng'}</span>
          </button>
        </div>
      </footer>

      {/* Zoom-like Audio Settings Popover */}
      {isAudioSettingsOpen && (
        <div className="absolute bottom-24 left-4 sm:left-10 z-40 w-80 sm:w-96 rounded-2xl border border-slate-700 bg-slate-900/98 p-5 shadow-2xl backdrop-blur-xl text-xs text-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <Settings className="h-4 w-4 text-primary" />
              <span>Cài đặt âm thanh (Audio)</span>
            </div>
            <button
              onClick={() => setIsAudioSettingsOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Micro selection */}
          <div className="mb-4">
            <label className="font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5 text-emerald-400" />
              <span>Microphone (Thiết bị thu âm)</span>
            </label>
            <select
              value={selectedMicId}
              onChange={(e) => void handleSelectMic(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-primary focus:outline-hidden cursor-pointer"
            >
              {audioInputDevices.length === 0 ? (
                <option value="">Mặc định hệ thống</option>
              ) : (
                audioInputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone (${d.deviceId.slice(0, 6)})`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Speaker selection */}
          <div className="mb-4">
            <label className="font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Headphones className="h-3.5 w-3.5 text-primary" />
              <span>Loa / Tai nghe (Thiết bị phát âm thanh)</span>
            </label>
            <select
              value={selectedSpeakerId}
              onChange={(e) => void handleSelectSpeaker(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-white focus:border-primary focus:outline-hidden cursor-pointer"
            >
              {audioOutputDevices.length === 0 ? (
                <option value="">Mặc định hệ thống</option>
              ) : (
                audioOutputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Loa / Tai nghe (${d.deviceId.slice(0, 6)})`}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Test Speaker Button */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Kiểm tra loa / tai nghe:</span>
            <button
              onClick={handleTestSpeaker}
              disabled={isTestingSpeaker}
              className="flex items-center gap-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 px-3 py-1.5 font-bold transition cursor-pointer disabled:opacity-50"
            >
              <Volume2 className={`h-3.5 w-3.5 ${isTestingSpeaker ? 'animate-bounce' : ''}`} />
              <span>{isTestingSpeaker ? 'Đang phát chuông...' : 'Kiểm tra loa'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODALS (End meeting for HR & Meeting ended for participants)          */}
      {/* ========================================================================= */}
      {/* HR End Meeting Dialog */}
      {isEndMeetingDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-slate-100">
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/10">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Kết thúc buổi phỏng vấn</h3>
                <p className="text-[11px] text-slate-400">Chọn hình thức rời phòng</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Bạn đang ở vai trò <strong className="text-white font-semibold">Người phỏng vấn (HR)</strong>. Bạn có thể kết thúc hoàn toàn buổi phỏng vấn cho tất cả mọi người hoặc chỉ rời phòng tạm thời.
            </p>

            <div className="space-y-3">
              {/* Option 1: End meeting for all */}
              <button
                onClick={handleEndMeetingForAll}
                disabled={isEndingMeeting}
                className="w-full flex items-center justify-between rounded-2xl bg-rose-600 hover:bg-rose-700 p-3.5 text-xs font-bold text-white transition shadow-lg shadow-rose-600/25 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <Power className="h-4 w-4" />
                  <div className="text-left">
                    <p className="font-bold">Kết thúc cuộc họp cho tất cả</p>
                    <p className="text-[10px] font-normal text-rose-100">
                      Đóng phòng họp ngay và hoàn tất buổi phỏng vấn
                    </p>
                  </div>
                </div>
                {isEndingMeeting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <span className="text-[10px] bg-rose-700 px-2.5 py-1 rounded-lg">Đóng phòng</span>
                )}
              </button>

              {/* Option 2: Just leave room */}
              <button
                onClick={() => {
                  setIsEndMeetingDialogOpen(false);
                  handleLeaveRoom();
                }}
                disabled={isEndingMeeting}
                className="w-full flex items-center justify-between rounded-2xl bg-slate-800 hover:bg-slate-700 p-3.5 text-xs font-semibold text-slate-200 transition border border-slate-700 cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <LogOut className="h-4 w-4 text-slate-400" />
                  <div className="text-left">
                    <p className="font-bold text-white">Chỉ mình tôi rời phòng</p>
                    <p className="text-[10px] font-normal text-slate-400">
                      Phòng họp vẫn duy trì cho người khác
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsEndMeetingDialogOpen(false)}
                disabled={isEndingMeeting}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Participant Meeting Ended Modal */}
      {isMeetingEndedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl text-center text-slate-100">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20 text-primary mb-4">
              <PhoneOff className="h-7 w-7" />
            </div>
            <h2 className="text-base font-bold text-white">Buổi phỏng vấn đã kết thúc</h2>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              {meetingEndedData?.endedBy || 'Người phỏng vấn'} đã kết thúc buổi phỏng vấn trực tuyến. Cảm ơn bạn đã dành thời gian tham gia buổi phỏng vấn này.
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Kết quả buổi phỏng vấn sẽ được nhà tuyển dụng cập nhật trên hệ thống trong thời gian tới.
            </p>

            <button
              onClick={handleLeaveRoom}
              className="mt-6 w-full rounded-2xl bg-primary py-3 text-xs font-bold text-white shadow-lg shadow-primary/30 transition hover:bg-primary-dark cursor-pointer"
            >
              Xác nhận & Thoát phòng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
