import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export const runtime = 'nodejs';
export const maxDuration = 90;

/**
 * AI 文案改写接口
 * 接收语音识别原文 + 用户自定义提示词，返回改写后文案
 *
 * 请求体：{ origin: string, prompt: string, style?: string }
 * 响应：{ success: boolean, rewrite?: string, error?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { origin, prompt, style } = body;

    if (!origin || typeof origin !== 'string' || !origin.trim()) {
      return NextResponse.json(
        { success: false, error: '缺少待改写的原文内容' },
        { status: 400 }
      );
    }

    // 构建系统提示词
    let systemPrompt =
      prompt?.trim() ||
      '把口述语音内容梳理通顺，剔除口语冗余语气词，逻辑分段清晰，精简凝练，适配 PPT 页面文字展示，不同要点之间用空行分隔。';

    // 追加风格指令
    if (style && typeof style === 'string' && style.trim()) {
      systemPrompt += `\n\n改写风格要求：${style.trim()}`;
    }

    systemPrompt +=
      '\n\n输出要求：\n1. 每个要点独占一段\n2. 段落之间用一个空行分隔\n3. 不要使用 markdown 标记符号（如 #、*、-）\n4. 第一段可作为标题（简短）';

    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: origin },
      ],
      thinking: { type: 'disabled' },
    });

    const rewrite = (completion?.choices?.[0]?.message?.content || '').trim();
    if (!rewrite) {
      return NextResponse.json(
        { success: false, error: 'AI 返回内容为空' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      rewrite,
      model: completion?.model,
    });
  } catch (error: any) {
    console.error('[Rewrite API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: `AI 改写失败：${error?.message || String(error)}`,
      },
      { status: 500 }
    );
  }
}
