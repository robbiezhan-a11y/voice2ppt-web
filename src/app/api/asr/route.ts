import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * 语音转文字接口
 * 接收 base64 编码的音频（wav/webm/mp3 等），返回识别文本
 *
 * 请求体：{ audio: string (base64), format?: string }
 * 响应：{ success: boolean, text?: string, error?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audio, format } = body;

    if (!audio || typeof audio !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少音频数据（audio 字段为 base64 字符串）' },
        { status: 400 }
      );
    }

    // 去掉可能的 data URL 前缀
    const base64Data = audio.replace(/^data:audio\/\w+;base64,/, '');

    // 校验 base64 有效性
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      return NextResponse.json(
        { success: false, error: '音频 base64 格式无效' },
        { status: 400 }
      );
    }

    // 文件大小预检（base64 长度 ≈ 原始大小 * 4/3）
    const sizeBytes = Math.floor((base64Data.length * 3) / 4);
    const sizeMB = sizeBytes / (1024 * 1024);
    if (sizeMB > 25) {
      return NextResponse.json(
        {
          success: false,
          error: `音频文件过大（${sizeMB.toFixed(1)}MB），上限 25MB，请缩短录音时长`,
        },
        { status: 413 }
      );
    }

    const zai = await ZAI.create();
    const response = await zai.audio.asr.create({
      file_base64: base64Data,
    });

    const text = (response?.text || '').trim();
    if (!text) {
      return NextResponse.json(
        { success: false, error: '未识别到语音内容（可能录音过短或环境嘈杂）' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      text,
      duration: response?.duration,
      sizeBytes,
    });
  } catch (error: any) {
    console.error('[ASR API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: `语音识别失败：${error?.message || String(error)}`,
      },
      { status: 500 }
    );
  }
}
