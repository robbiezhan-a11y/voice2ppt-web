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

    // 去掉可能的 data URL 前缀（兼容各种 MIME + codecs 参数）
    // 格式示例：data:audio/webm;base64,xxxx 或 data:audio/webm;codecs=opus;base64,xxxx
    let base64Data = audio;
    const dataUrlMatch = audio.match(/^data:[^;]+(?:;[^;]*)*;base64,(.*)$/);
    if (dataUrlMatch) {
      base64Data = dataUrlMatch[1];
    }

    // 去除可能存在的换行符、空格（部分浏览器/传输会引入）
    base64Data = base64Data.replace(/\s+/g, '');

    // 校验非空
    if (!base64Data) {
      return NextResponse.json(
        { success: false, error: '音频 base64 数据为空' },
        { status: 400 }
      );
    }

    // 校验 base64 有效性（允许标准 base64 字符 + = 填充）
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
      return NextResponse.json(
        {
          success: false,
          error: `音频 base64 格式无效（前 20 字符：${base64Data.slice(0, 20)}...）`,
        },
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
