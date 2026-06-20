# -*- coding: utf-8 -*-
"""
PPT 语音 AI 改写工具 - 图标生成脚本
使用 Pillow 生成 256x256 的程序图标，输出 icon.ico + icon.png
可重复执行：python generate_icon.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 256
OUT_DIR = os.path.dirname(os.path.abspath(__file__))


def get_font(size):
    """优先使用系统中文字体，找不到则用默认。"""
    candidates = [
        "C:/Windows/Fonts/msyh.ttc",      # 微软雅黑
        "C:/Windows/Fonts/simhei.ttf",     # 黑体
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/PingFang.ttc",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_icon():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 圆角背景渐变（用两色叠加模拟）
    # 主色：绿色系（避开 indigo/blue），代表"语音+智能"
    bg_color = (16, 122, 87)   # 深绿
    accent = (34, 197, 94)     # 亮绿

    # 圆角矩形背景
    radius = 48
    draw.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=bg_color)

    # 顶部高光条
    draw.rounded_rectangle(
        [20, 20, SIZE - 20, 60], radius=20, fill=accent
    )

    # ---- 麦克风图标（中间区域）----
    mic_x, mic_y = SIZE // 2, 130
    # 麦克风主体（圆角矩形）
    mic_w, mic_h = 44, 70
    draw.rounded_rectangle(
        [mic_x - mic_w // 2, mic_y - mic_h // 2,
         mic_x + mic_w // 2, mic_y + mic_h // 2],
        radius=22, fill=(255, 255, 255, 255)
    )
    # 麦克风支架（U 形）
    arc_box = [mic_x - 38, mic_y - 10, mic_x + 38, mic_y + 60]
    draw.arc(arc_box, start=0, end=180, fill=(255, 255, 255, 255), width=6)
    # 麦克风底座
    draw.line([mic_x, mic_y + 50, mic_x, mic_y + 70], fill=(255, 255, 255, 255), width=6)
    draw.rounded_rectangle(
        [mic_x - 28, mic_y + 68, mic_x + 28, mic_y + 80], radius=6,
        fill=(255, 255, 255, 255)
    )

    # ---- 底部 "PPT" 文字 ----
    font = get_font(46)
    text = "PPT"
    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    except Exception:
        tw, th = 80, 40
    tx = (SIZE - tw) // 2
    ty = 188
    # 文字阴影
    draw.text((tx + 2, ty + 2), text, fill=(0, 0, 0, 120), font=font)
    draw.text((tx, ty), text, fill=(255, 255, 255, 255), font=font)

    return img


def main():
    img = draw_icon()
    ico_path = os.path.join(OUT_DIR, "icon.ico")
    png_path = os.path.join(OUT_DIR, "icon.png")

    # 保存 PNG
    img.save(png_path, "PNG")
    print(f"[OK] 已生成: {png_path}")

    # 保存 ICO（多尺寸，Windows 自动选最合适）
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    img.save(ico_path, format="ICO", sizes=sizes)
    print(f"[OK] 已生成: {ico_path}")

    # 同时输出到 assets 目录备份
    assets_ico = os.path.join(OUT_DIR, "assets", "icon.ico")
    img.save(assets_ico, format="ICO", sizes=sizes)
    print(f"[OK] 已备份: {assets_ico}")


if __name__ == "__main__":
    main()
