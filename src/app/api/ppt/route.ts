import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import pptxgen from 'pptxgenjs';

export const runtime = 'nodejs';
export const maxDuration = 90;

interface SlideData {
  title: string;
  bullets: string[];
}

/**
 * PPT 生成接口
 * 接收改写后的文案，先调用 LLM 结构化为幻灯片数组，再用 pptxgenjs 生成 .pptx
 *
 * 请求体：{ content: string, template?: 'green' | 'dark' | 'minimal' }
 * 响应：Binary .pptx 文件（Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation）
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { content, template = 'green' } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { success: false, error: '缺少 PPT 内容' },
        { status: 400 }
      );
    }

    // ---- 1. 调用 LLM 把文案结构化为幻灯片数组 ----
    const slides = await structureContent(content);

    if (!slides.length) {
      return NextResponse.json(
        { success: false, error: '内容结构化失败，未生成任何幻灯片' },
        { status: 500 }
      );
    }

    // ---- 2. 用 pptxgenjs 生成 pptx ----
    const pptx = new pptxgen();
    pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
    pptx.layout = 'WIDE';
    pptx.author = 'PPT Voice Rewrite Tool';
    pptx.company = 'PPTVoiceRewrite';
    pptx.subject = 'AI Generated Presentation';

    // 主题配色
    const themes = {
      green: { bg: 'F0FDF4', primary: '166534', accent: '22C55E', text: '1F2937', light: 'DCFCE7' },
      dark: { bg: '0F172A', primary: '38BDF8', accent: '818CF8', text: 'F1F5F9', light: '1E293B' },
      minimal: { bg: 'FFFFFF', primary: '111827', accent: '6B7280', text: '1F2937', light: 'F3F4F6' },
    };
    const theme = themes[template as keyof typeof themes] || themes.green;

    // 封面页
    const cover = pptx.addSlide();
    cover.background = { color: theme.primary };
    cover.addText('AI 生成演示文稿', {
      x: 0.8, y: 2.5, w: 11.7, h: 1.2,
      fontSize: 40, bold: true, color: 'FFFFFF', align: 'center',
      fontFace: 'Microsoft YaHei',
    });
    cover.addText('由语音识别 + AI 改写自动生成', {
      x: 0.8, y: 3.8, w: 11.7, h: 0.6,
      fontSize: 18, color: theme.light, align: 'center',
      fontFace: 'Microsoft YaHei',
    });
    cover.addText(new Date().toLocaleString('zh-CN'), {
      x: 0.8, y: 6.5, w: 11.7, h: 0.4,
      fontSize: 12, color: theme.light, align: 'center',
    });

    // 内容页
    for (const slide of slides) {
      const s = pptx.addSlide();
      s.background = { color: theme.bg };

      // 标题
      s.addText(slide.title || '内容', {
        x: 0.6, y: 0.4, w: 12.1, h: 0.9,
        fontSize: 28, bold: true, color: theme.primary,
        fontFace: 'Microsoft YaHei',
      });

      // 标题下分隔线
      s.addShape(pptx.ShapeType.rect, {
        x: 0.6, y: 1.3, w: 2.0, h: 0.08,
        fill: { color: theme.accent },
        line: { color: theme.accent },
      });

      // 要点
      if (slide.bullets && slide.bullets.length) {
        const bulletText = slide.bullets
          .map((b) => ({ text: b, options: { bullet: { code: '2022' }, breakLine: true } }));

        s.addText(bulletText, {
          x: 0.8, y: 1.7, w: 11.7, h: 5.2,
          fontSize: 18, color: theme.text, lineSpacingMultiple: 1.5,
          fontFace: 'Microsoft YaHei',
        });
      }

      // 页脚
      s.addText(`${s.slideNumber} / ${slides.length + 1}`, {
        x: 11.5, y: 7.0, w: 1.3, h: 0.3,
        fontSize: 10, color: theme.accent, align: 'right',
      });
    }

    // 结束页
    const end = pptx.addSlide();
    end.background = { color: theme.primary };
    end.addText('谢谢观看', {
      x: 0.8, y: 3.0, w: 11.7, h: 1.2,
      fontSize: 44, bold: true, color: 'FFFFFF', align: 'center',
      fontFace: 'Microsoft YaHei',
    });
    end.addText('由 PPT 语音 AI 改写工具生成', {
      x: 0.8, y: 4.3, w: 11.7, h: 0.5,
      fontSize: 14, color: theme.light, align: 'center',
    });

    // ---- 3. 输出为 Buffer ----
    const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;

    // 文件名
    const filename = `PPT_AI_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-6)}.pptx`;

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'X-Slide-Count': String(slides.length + 2),
      },
    });
  } catch (error: any) {
    console.error('[PPT API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: `PPT 生成失败：${error?.message || String(error)}`,
      },
      { status: 500 }
    );
  }
}

/**
 * 调用 LLM 把自由文本结构化为幻灯片数组
 */
async function structureContent(content: string): Promise<SlideData[]> {
  const zai = await ZAI.create();

  const systemPrompt = `你是一个专业的 PPT 内容结构化助手。
请把用户提供的文案整理成适合 PPT 展示的幻灯片数组。

规则：
1. 每张幻灯片包含一个标题（简短，≤15字）和 3-6 个要点
2. 每个要点 ≤40 字，提炼核心信息
3. 内容较多时拆分为多张幻灯片，每张聚焦一个主题
4. 不要编造用户文案中没有的内容
5. 严格输出 JSON 格式，不要任何额外文字、不要 markdown 代码块

输出格式：
{"slides":[{"title":"标题","bullets":["要点1","要点2","要点3"]}]}`;

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content },
    ],
    thinking: { type: 'disabled' },
  });

  const raw = (completion?.choices?.[0]?.message?.content || '').trim();

  // 尝试提取 JSON（兼容模型可能包裹 ```json 的情况）
  let jsonStr = raw;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const slides = parsed.slides || parsed.data || parsed;
    if (!Array.isArray(slides)) {
      throw new Error('结构化结果不是数组');
    }
    return slides
      .filter((s: any) => s && typeof s === 'object')
      .map((s: any) => ({
        title: String(s.title || s.heading || '内容').slice(0, 50),
        bullets: Array.isArray(s.bullets || s.points)
          ? (s.bullets || s.points).map((b: any) => String(b).slice(0, 100))
          : [],
      }))
      .filter((s: SlideData) => s.title || (s.bullets && s.bullets.length));
  } catch (e) {
    console.error('[PPT API] JSON parse failed, fallback to paragraph split. Raw:', raw.slice(0, 200));
    // 降级方案：按段落切分
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    return paragraphs.slice(0, 10).map((p, i) => {
      const lines = p.split('\n').filter(Boolean);
      return {
        title: lines[0].slice(0, 15) || `第 ${i + 1} 部分`,
        bullets: lines.slice(1).length ? lines.slice(1).map((l) => l.slice(0, 100)) : [lines[0].slice(0, 100)],
      };
    });
  }
}
