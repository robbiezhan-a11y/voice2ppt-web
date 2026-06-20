'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

interface UseAudioRecorderOptions {
  /** 采样率，默认 16000（ASR 最优） */
  sampleRate?: number;
  /** 声道数，默认 1（单声道） */
  channels?: number;
}

interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number; // 秒
  audioLevel: number; // 0-100
  audioBlob: Blob | null;
  audioBase64: string | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
}

/**
 * 浏览器音频录音 Hook
 * - 使用 MediaRecorder API 录制音频
 * - 通过 AnalyserNode 实时计算音量电平（VU）
 * - 输出 webm/opus 格式（Chrome 默认），后端 ASR 支持
 * - 自动将 Blob 转为 base64 供 API 上传
 */
export function useAudioRecorder(
  options: UseAudioRecorderOptions = {}
): UseAudioRecorderReturn {
  const { sampleRate = 16000, channels = 1 } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  const updateLevelRef = useRef<() => void>(() => {});

  const updateLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(dataArray);
    // 计算 RMS 归一化到 0-100
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const level = Math.min(100, Math.round(rms * 300)); // x3 灵敏度
    setAudioLevel(level);
    rafRef.current = requestAnimationFrame(updateLevelRef.current);
  }, []);

  useEffect(() => {
    updateLevelRef.current = updateLevel;
  }, [updateLevel]);

  const start = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setAudioBase64(null);
    setDuration(0);
    setAudioLevel(0);
    chunksRef.current = [];

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前浏览器不支持录音功能（需要 MediaRecorder API）');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: channels,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // 设置 AnalyserNode 用于 VU 电平
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 创建 MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        setAudioBlob(blob);
        // 转 base64
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          setAudioBase64(result);
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(1000); // 每秒产生一个数据块
      setIsRecording(true);
      setIsPaused(false);
      startTimeRef.current = Date.now();

      // 时长计时
      durationTimerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      // VU 电平
      rafRef.current = requestAnimationFrame(updateLevelRef.current);
    } catch (err: any) {
      console.error('[Recorder] start failed:', err);
      if (err?.name === 'NotAllowedError') {
        setError('麦克风权限被拒绝，请在浏览器设置中允许使用麦克风');
      } else if (err?.name === 'NotFoundError') {
        setError('未找到麦克风设备，请检查音频设备连接');
      } else {
        setError(`录音启动失败：${err?.message || String(err)}`);
      }
      cleanup();
    }
  }, [sampleRate, channels, cleanup, updateLevel]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsPaused(false);
    setAudioLevel(0);
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // 停止 tracks 但保留 audioContext 以便后续处理（cleanup 会在 unmount 时关闭）
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
  }, []);

  const pause = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      rafRef.current = requestAnimationFrame(updateLevelRef.current);
    }
  }, []);

  const reset = useCallback(() => {
    setAudioBlob(null);
    setAudioBase64(null);
    setDuration(0);
    setAudioLevel(0);
    setError(null);
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isRecording,
    isPaused,
    duration,
    audioLevel,
    audioBlob,
    audioBase64,
    error,
    start,
    stop,
    pause,
    resume,
    reset,
  };
}
