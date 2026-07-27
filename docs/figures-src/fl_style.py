"""Shared monochrome style for floorlaunch figures."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import matplotlib.font_manager as fm

fm._load_fontmanager(try_read_cache=False)

INK = "#111111"
G1 = "#4a4a4a"
G2 = "#8a8a8a"
G3 = "#bfbfbf"
G4 = "#e2e2e2"
G5 = "#f2f2f2"
WHITE = "#ffffff"

plt.rcParams.update({
    "font.family": "Inter",
    "font.size": 10,
    "text.color": INK,
    "axes.edgecolor": G2,
    "axes.labelcolor": INK,
    "axes.linewidth": 0.9,
    "axes.titlesize": 12,
    "axes.titleweight": "semibold",
    "axes.titlelocation": "left",
    "axes.titlepad": 12,
    "axes.labelsize": 9.5,
    "xtick.color": G1,
    "ytick.color": G1,
    "xtick.labelsize": 9,
    "ytick.labelsize": 9,
    "legend.frameon": False,
    "legend.fontsize": 9,
    "figure.facecolor": WHITE,
    "axes.facecolor": WHITE,
    "savefig.facecolor": WHITE,
    "figure.dpi": 200,
})


def clean_axes(ax, grid=True):
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(G3)
    ax.tick_params(length=3, width=0.8)
    if grid:
        ax.grid(True, color=G4, linewidth=0.7, alpha=1.0)
        ax.set_axisbelow(True)


def canvas(w=9.0, h=5.4, xlim=(0, 100), ylim=(0, 100)):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.axis("off")
    return fig, ax


def box(ax, x, y, w, h, text, fill=WHITE, edge=INK, lw=1.1, fontsize=9.5,
        weight="regular", textcolor=INK, radius=1.4, dashed=False, zorder=3):
    """x, y is the center of the box."""
    patch = FancyBboxPatch(
        (x - w / 2, y - h / 2), w, h,
        boxstyle=f"round,pad=0,rounding_size={radius}",
        linewidth=lw, edgecolor=edge, facecolor=fill,
        linestyle=(0, (3, 2)) if dashed else "solid", zorder=zorder,
    )
    ax.add_patch(patch)
    ax.text(x, y, text, ha="center", va="center", fontsize=fontsize,
            fontweight=weight, color=textcolor, zorder=zorder + 1,
            linespacing=1.45)
    return (x, y, w, h)


def arrow(ax, start, end, color=INK, lw=1.1, style="-|>", rad=0.0,
          dashed=False, zorder=2, ms=7):
    a = FancyArrowPatch(
        start, end, arrowstyle=style, mutation_scale=ms,
        linewidth=lw, color=color, zorder=zorder,
        connectionstyle=f"arc3,rad={rad}",
        linestyle=(0, (3, 2)) if dashed else "solid",
        shrinkA=0, shrinkB=0,
    )
    ax.add_patch(a)
    return a


def edge(cx, cy, w, h, tx, ty, margin=1.2):
    """Point on the border of a box centred at (cx, cy) facing (tx, ty)."""
    dx, dy = tx - cx, ty - cy
    if dx == 0 and dy == 0:
        return (cx, cy)
    hw, hh = w / 2 + margin, h / 2 + margin
    sx = abs(dx) / hw if dx else 0
    sy = abs(dy) / hh if dy else 0
    s = max(sx, sy)
    return (cx + dx / s, cy + dy / s)


def connect(ax, b1, b2, rad=0.0, dashed=False, color=INK, lw=1.1, margin=1.2):
    """Arrow from box tuple b1 to box tuple b2, anchored on their borders."""
    x1, y1, w1, h1 = b1
    x2, y2, w2, h2 = b2
    start = edge(x1, y1, w1, h1, x2, y2, margin)
    end = edge(x2, y2, w2, h2, x1, y1, margin)
    return arrow(ax, start, end, rad=rad, dashed=dashed, color=color, lw=lw)


def label(ax, x, y, text, fontsize=8.5, color=G1, ha="center", va="center",
          weight="regular", bg=None, zorder=5):
    kw = {}
    if bg:
        kw["bbox"] = dict(facecolor=bg, edgecolor="none", pad=1.8)
    ax.text(x, y, text, ha=ha, va=va, fontsize=fontsize, color=color,
            fontweight=weight, zorder=zorder, linespacing=1.4, **kw)


def title_block(ax, title, subtitle=None, x=0, y=100):
    ax.text(x, y, title, ha="left", va="top", fontsize=12.5,
            fontweight="semibold", color=INK)
    if subtitle:
        ax.text(x, y - 5.6, subtitle, ha="left", va="top", fontsize=9.2,
                color=G1, linespacing=1.4)


def save(fig, name, outdir="."):
    import os
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, name)
    fig.savefig(path, bbox_inches="tight", pad_inches=0.25)
    plt.close(fig)
    print(path)
    return path
