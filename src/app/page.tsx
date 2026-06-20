'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useToast } from '@/hooks/use-toast';
import {
  Mic, Square, Play, Pause, RefreshCw, Download, Loader2,
  FileText, Sparkles, Settings2, History,
  CheckCircle2, AudioLines, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

type Stage = 'idle' | 'recording' | 'recorded' | 'transcribing' | 'transcribed' | 'rewriting' | 'rewritten';

interface HistoryItem {
  id: string;
  time: string;
  origin: string;
  rewrite: string;
  prompt: string;
  duration: number;
}

const DEFAULT_PROMPT =
  '把口述语音内容梳理通顺，剔除口语冗余语气词，逻辑分段清晰，精简凝练，适配 PPT 页面文字展示，不同要点之间用空行分隔。';

const STYLE_PRESETS = [
  { value: 'concise', label: '精简凝练（适合演讲）' },
  { value: 'formal', label: '正式商务（适合汇报）' },
  { value: 'casual', label: '通俗易懂（适合培训）' },
  { value: 'keypoints', label: '要点提炼（适合摘要）' },
  { value: 'story', label: '叙事流畅（适合分享）' },
];

const TEMPLATES = [
  { value: 'green', label: '清新绿（推荐）' },
  { value: 'dark', label: '深色商务' },
  { value: 'minimal', label: '极简白' },
];

export default function Home() {
  const recorder = useAudioRecorder({ sampleRate: 16000, channels: 1 });
  const { toast } = useToast();

  const [stage, setStage] = useState<Stage>('idle');
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [style, setStyle] = useState('concise');
  const [template, setTemplate] = useState('green');
  const [originText, setOriginText] = useState('');
  const [rewriteText, setRewriteText] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [previewDialog, setPreviewDialog] = useState(false);
  const [pptDownloading, setPptDownloading] = useState(false);
  const downloadUrlRef = useRef<string | null>(null);

  // 录音完成后生成预览 URL
  useEffect(() => {
    if (recorder.audioBlob) {
      const url = URL.createObjectURL(recorder.audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl(null);
    }
  }, [recorder.audioBlob]);

  // 录音停止后自动进入 recorded 状态
  useEffect(() => {
    if (!recorder.isRecording && recorder.audioBlob && stage === 'recording') {
      setStage('recorded');
    }
  }, [recorder.isRecording, recorder.audioBlob, stage]);

  // 错误提示
  useEffect(() => {
    if (recorder.error) {
      toast({
        title: '录音错误',
        description: recorder.error,
        variant: 'destructive',
      });
      setStage('idle');
    }
  }, [recorder.error, toast]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStartRecord = async () => {
    setOriginText('');
    setRewriteText('');
    setProgressMsg('');
    await recorder.start();
    setStage('recording');
  };

  const handleStopRecord = () => {
    recorder.stop();
    // stage 会在 useEffect 中切换到 'recorded'
  };

  // 语音识别
  const handleTranscribe = async () => {
    if (!recorder.audioBase64) {
      toast({ title: '无音频数据', variant: 'destructive' });
      return;
    }
    setStage('transcribing');
    setProgressMsg('正在上传音频进行语音识别...');
    try {
      const resp = await fetch('/api/asr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: recorder.audioBase64 }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || `识别失败（HTTP ${resp.status}）`);
      }
      setOriginText(data.text);
      setStage('transcribed');
      toast({
        title: '语音识别完成',
        description: `识别到 ${data.text.length} 字`,
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: '语音识别失败',
        description: err.message,
        variant: 'destructive',
      });
      setStage('recorded');
    } finally {
      setProgressMsg('');
    }
  };

  // AI 改写
  const handleRewrite = async () => {
    if (!originText.trim()) {
      toast({ title: '没有可改写的内容', variant: 'destructive' });
      return;
    }
    setStage('rewriting');
    setProgressMsg('AI 正在改写文案...');
    try {
      const resp = await fetch('/api/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: originText, prompt, style }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || `改写失败（HTTP ${resp.status}）`);
      }
      setRewriteText(data.rewrite);
      setStage('rewritten');
      toast({ title: 'AI 改写完成', description: '可预览编辑后生成 PPT' });
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'AI 改写失败',
        description: err.message,
        variant: 'destructive',
      });
      setStage('transcribed');
    } finally {
      setProgressMsg('');
    }
  };

  // 生成 PPT 并下载
  const handleGeneratePpt = async (content: string) => {
    setPptDownloading(true);
    setProgressMsg('正在生成 PPT 文件...');
    try {
      const resp = await fetch('/api/ppt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, template }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `PPT 生成失败（HTTP ${resp.status}）`);
      }
      const blob = await resp.blob();
      const slideCount = resp.headers.get('X-Slide-Count') || '?';

      // 下载
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      downloadUrlRef.current = url;
      const a = document.createElement('a');
      a.href = url;
      a.download = `PPT_AI_${new Date().toISOString().slice(0, 10)}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast({
        title: 'PPT 生成成功',
        description: `共 ${slideCount} 页幻灯片，已开始下载`,
      });

      // 保存历史
      const item: HistoryItem = {
        id: Date.now().toString(),
        time: new Date().toLocaleString('zh-CN'),
        origin: originText,
        rewrite: content,
        prompt,
        duration: recorder.duration,
      };
      setHistory((prev) => [item, ...prev].slice(0, 50));
    } catch (err: any) {
      console.error(err);
      toast({
        title: 'PPT 生成失败',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setPptDownloading(false);
      setProgressMsg('');
    }
  };

  const handleReset = () => {
    recorder.reset();
    setOriginText('');
    setRewriteText('');
    setProgressMsg('');
    setStage('idle');
  };

  const isBusy = stage === 'transcribing' || stage === 'rewriting' || pptDownloading;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
              <AudioLines className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">PPT 语音 AI 改写工具</h1>
              <p className="text-xs text-muted-foreground mt-0.5">录音 → 识别 → 改写 → 生成 PPT</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Web 版 · 免安装
            </Badge>
            <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <History className="w-4 h-4 mr-1" />
                  历史
                  {history.length > 0 && (
                    <Badge variant="default" className="ml-1 h-5 px-1.5">
                      {history.length}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>改写历史记录</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-100px)] mt-4">
                  {history.length === 0 ? (
                    <div className="text-center text-muted-foreground py-12 text-sm">
                      暂无历史记录
                    </div>
                  ) : (
                    <div className="space-y-3 pr-2">
                      {history.map((item) => (
                        <Card key={item.id} className="p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">{item.time}</span>
                            <Badge variant="outline" className="text-xs">
                              {formatDuration(item.duration)}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium line-clamp-1 mb-1">
                            {item.rewrite.split('\n')[0] || '(空)'}
                          </p>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            原文：{item.origin.slice(0, 60)}...
                          </p>
                          <div className="flex gap-1 mt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setOriginText(item.origin);
                                setRewriteText(item.rewrite);
                                setPrompt(item.prompt);
                                setStage('rewritten');
                                setHistoryOpen(false);
                              }}
                            >
                              <Eye className="w-3 h-3 mr-1" /> 查看
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => handleGeneratePpt(item.rewrite)}
                              disabled={isBusy}
                            >
                              <Download className="w-3 h-3 mr-1" /> 导 PPT
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 container mx-auto max-w-6xl px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左栏：录音 + 识别 */}
          <div className="space-y-4">
            {/* 录音卡片 */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  录制语音
                </h2>
                {recorder.isRecording && (
                  <Badge variant="destructive" className="animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-white mr-1" />
                    REC
                  </Badge>
                )}
              </div>

              {/* 录音按钮 + 时长 */}
              <div className="flex flex-col items-center py-6">
                <button
                  onClick={recorder.isRecording ? handleStopRecord : handleStartRecord}
                  disabled={isBusy}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                    recorder.isRecording
                      ? 'bg-red-500 hover:bg-red-600 scale-110'
                      : 'bg-emerald-600 hover:bg-emerald-700 hover:scale-105'
                  } disabled:opacity-50 disabled:cursor-not-allowed text-white`}
                  aria-label={recorder.isRecording ? '停止录音' : '开始录音'}
                >
                  {recorder.isRecording ? (
                    <Square className="w-8 h-8" fill="currentColor" />
                  ) : (
                    <Mic className="w-10 h-10" />
                  )}
                </button>
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  {recorder.isRecording
                    ? recorder.isPaused
                      ? '已暂停'
                      : '录音中... 点击停止'
                    : '点击开始录音'}
                </p>
                <p className="mt-1 text-2xl font-mono font-bold tabular-nums">
                  {formatDuration(recorder.duration)}
                </p>
              </div>

              {/* VU 电平条 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">音量电平</span>
                  <span className="font-mono">{recorder.audioLevel}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-primary/20 relative">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      recorder.audioLevel > 80
                        ? 'bg-red-500'
                        : recorder.audioLevel > 50
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${recorder.audioLevel}%` }}
                  />
                </div>
              </div>

              {/* 暂停/恢复（录音中显示） */}
              {recorder.isRecording && (
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={recorder.isPaused ? recorder.resume : recorder.pause}
                    className="flex-1"
                  >
                    {recorder.isPaused ? (
                      <><Play className="w-4 h-4 mr-1" /> 恢复</>
                    ) : (
                      <><Pause className="w-4 h-4 mr-1" /> 暂停</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStopRecord}
                    className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                  >
                    <Square className="w-4 h-4 mr-1" /> 停止
                  </Button>
                </div>
              )}

              {/* 音频预览 */}
              {audioUrl && !recorder.isRecording && (
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    录音完成（{formatDuration(recorder.duration)}）
                  </p>
                  <audio src={audioUrl} controls className="w-full h-9" />
                </div>
              )}
            </Card>

            {/* 识别结果 */}
            {(stage === 'transcribing' || originText) && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                      2
                    </span>
                    语音识别结果
                  </h2>
                  {originText && (
                    <Badge variant="secondary">{originText.length} 字</Badge>
                  )}
                </div>
                {stage === 'transcribing' ? (
                  <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">{progressMsg || '识别中...'}</span>
                  </div>
                ) : (
                  <>
                    <Textarea
                      value={originText}
                      onChange={(e) => setOriginText(e.target.value)}
                      className="min-h-[120px] resize-y"
                      placeholder="识别结果将显示在这里，可手动编辑..."
                    />
                    <Button
                      onClick={handleRewrite}
                      disabled={isBusy || !originText.trim()}
                      className="w-full mt-3"
                    >
                      {stage === 'rewriting' ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 改写中...</>
                      ) : (
                        <><Sparkles className="w-4 h-4 mr-2" /> AI 改写文案</>
                      )}
                    </Button>
                  </>
                )}
              </Card>
            )}
          </div>

          {/* 右栏：提示词 + 改写结果 */}
          <div className="space-y-4">
            {/* 提示词配置 */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  AI 改写配置
                </h2>
              </div>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">改写风格</Label>
                  <Select value={style} onValueChange={setStyle}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STYLE_PRESETS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">自定义改写要求</Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="mt-1 min-h-[80px] resize-y text-sm"
                    placeholder="描述你希望的改写方式..."
                  />
                </div>
                <div>
                  <Label className="text-xs">PPT 模板</Label>
                  <Select value={template} onValueChange={setTemplate}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TEMPLATES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            {/* 改写结果 */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  改写结果
                </h2>
                {rewriteText && (
                  <Badge variant="secondary">{rewriteText.length} 字</Badge>
                )}
              </div>

              {stage === 'rewriting' ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">{progressMsg || '改写中...'}</span>
                </div>
              ) : rewriteText ? (
                <>
                  <Textarea
                    value={rewriteText}
                    onChange={(e) => setRewriteText(e.target.value)}
                    className="min-h-[200px] resize-y"
                  />
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <Button
                      variant="outline"
                      onClick={() => setPreviewDialog(true)}
                      disabled={isBusy}
                    >
                      <Eye className="w-4 h-4 mr-2" /> 预览
                    </Button>
                    <Button
                      onClick={() => handleGeneratePpt(rewriteText)}
                      disabled={isBusy}
                      className="bg-emerald-600 hover:bg-emerald-700"
                    >
                      {pptDownloading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 生成中...</>
                      ) : (
                        <><Download className="w-4 h-4 mr-2" /> 生成 PPT</>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {stage === 'idle'
                      ? '先录制语音，识别后点击「AI 改写」'
                      : stage === 'recorded'
                      ? '点击左侧「语音识别」按钮开始'
                      : stage === 'transcribed'
                      ? '点击「AI 改写文案」生成结果'
                      : '等待处理...'}
                  </p>
                </div>
              )}
            </Card>

            {/* 重置 */}
            {(stage !== 'idle' && stage !== 'recording') && (
              <Button
                variant="ghost"
                onClick={handleReset}
                className="w-full"
                disabled={isBusy}
              >
                <RefreshCw className="w-4 h-4 mr-2" /> 重新开始
              </Button>
            )}
          </div>
        </div>

        {/* 流程指引 */}
        {stage === 'idle' && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-3">
            {[
              { icon: Mic, title: '1. 录制语音', desc: '浏览器直接录音，无需安装' },
              { icon: AudioLines, title: '2. 语音识别', desc: 'ASR 自动转文字' },
              { icon: Sparkles, title: '3. AI 改写', desc: '智能优化文案' },
              { icon: Download, title: '4. 生成 PPT', desc: '一键下载 .pptx 文件' },
            ].map((step, i) => (
              <Card key={i} className="p-4 text-center">
                <step.icon className="w-8 h-8 mx-auto mb-2 text-emerald-600" />
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/80 backdrop-blur-sm mt-auto">
        <div className="container mx-auto max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground">
          <p>
            PPT 语音 AI 改写工具 · Web 版 V1.0 · 跨平台免安装 · 基于 ASR + LLM + pptxgenjs
          </p>
          <p className="mt-1">
            录音在浏览器本地完成，音频与文本仅用于本次处理，不会持久存储
          </p>
        </div>
      </footer>

      {/* 预览弹窗 */}
      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>改写内容预览</DialogTitle>
            <DialogDescription>
              确认内容无误后，点击「生成 PPT」下载演示文稿
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="prose prose-sm max-w-none whitespace-pre-wrap p-4 bg-muted/30 rounded-lg">
              {rewriteText}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewDialog(false)}>
              关闭
            </Button>
            <Button
              onClick={() => {
                setPreviewDialog(false);
                handleGeneratePpt(rewriteText);
              }}
              disabled={isBusy}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Download className="w-4 h-4 mr-2" /> 生成 PPT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
