import numpy as np
import matplotlib.pyplot as plt
from fl_style import *

VS, VT, F = 25.0, 1e9, 0.007

# ---------------------------------------------------------------- figure 1
R = np.linspace(0, 100, 400)
MC = (VS + R) ** 2 / VS
TOK = 1e9 * R / (VS + R) / 1e6  # millions

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.2, 4.4))

ax1.plot(R, MC, color=INK, lw=2.0)
ax1.axvline(100, color=G3, lw=0.9, ls=(0, (3, 2)))
for r in (0, 25, 50, 75, 100):
    mc = (VS + r) ** 2 / VS
    ax1.plot([r], [mc], "o", ms=4.5, color=INK, zorder=5)
    ax1.annotate(f"{mc:g}", (r, mc), textcoords="offset points",
                 xytext=(-4, 9), ha="right", fontsize=8.5, color=G1)
ax1.set_xlabel("SOL raised on the curve, R")
ax1.set_ylabel("Market cap (SOL)")
ax1.set_title("Market cap is quadratic in the raise")
ax1.set_xlim(-2, 106)
ax1.set_ylim(0, 700)
clean_axes(ax1)
axr = ax1.twinx()
axr.set_ylim(0, 0.700)
axr.set_ylabel("Price per unit (SOL)", color=G1)
axr.tick_params(colors=G1, length=3, width=0.8)
for s in ("top", "left"):
    axr.spines[s].set_visible(False)
axr.spines["right"].set_color(G3)
ax1.text(101, 40, "graduation", rotation=90, fontsize=8.5, color=G2,
         ha="right", va="bottom")

ax2.plot(R, TOK, color=INK, lw=2.0)
ax2.fill_between(R, TOK, color=G5, zorder=0)
ax2.axhline(800, color=G3, lw=0.9, ls=(0, (3, 2)))
ax2.plot([100], [800], "o", ms=4.5, color=INK, zorder=5)
ax2.annotate("800M sold at graduation\n200M left: 160M seeds the AMM, 40M burns",
             (100, 800), textcoords="offset points", xytext=(-14, -110),
             ha="right", fontsize=8.5, color=G1)
ax2.set_xlabel("SOL raised on the curve, R")
ax2.set_ylabel("Tokens sold (millions)")
ax2.set_title("Half the float goes in the first 25 SOL")
ax2.set_xlim(-2, 106)
ax2.set_ylim(0, 1000)
clean_axes(ax2)

fig.suptitle("The curve phase", x=0.005, y=1.06, ha="left",
             fontsize=13.5, fontweight="semibold", color=INK)
fig.text(0.005, 0.995, "Constant product on virtual reserves of 25 SOL and 1B tokens. "
         "One unit is 1M tokens.", ha="left", va="bottom", fontsize=9.2, color=G1)
fig.tight_layout()
save(fig, "01-curve-phase.png")

# ---------------------------------------------------------------- figure 2
Rg = np.linspace(0, 100, 400)
d = 1.0 * (1 - F)
tok_1sol = 1e9 * VS * d / ((VS + Rg) * (VS + Rg + d)) / 1e6
move = (((VS + Rg + d) / (VS + Rg)) ** 2 - 1) * 100

fig, ax = plt.subplots(figsize=(9.4, 4.8))
ax.plot(Rg, tok_1sol, color=INK, lw=2.0, label="Tokens received (millions)")
ax.set_xlabel("State of the curve when the buy lands, R (SOL raised)")
ax.set_ylabel("Tokens received for 1 SOL (millions)")
ax.set_title("The curve front loads discovery")
ax.set_xlim(-2, 102)
ax.set_ylim(0, 44)
clean_axes(ax)

ax2 = ax.twinx()
ax2.plot(Rg, move, color=G2, lw=1.8, ls=(0, (4, 2)),
         label="Price move from that buy (%)")
ax2.set_ylabel("Price move from the same 1 SOL buy (%)", color=G1)
ax2.set_ylim(0, 9.5)
ax2.tick_params(colors=G1, length=3, width=0.8)
for s in ("top", "left"):
    ax2.spines[s].set_visible(False)
ax2.spines["right"].set_color(G3)

for r in (0, 90):
    t = 1e9 * VS * d / ((VS + r) * (VS + r + d)) / 1e6
    m = (((VS + r + d) / (VS + r)) ** 2 - 1) * 100
    ax.plot([r], [t], "o", ms=5, color=INK, zorder=6)
    ax2.plot([r], [m], "o", ms=5, color=G2, zorder=6)
ax.annotate("R = 0: 38.2M tokens, +8.1%", (0, 38.2),
            textcoords="offset points", xytext=(14, 4), fontsize=9, color=INK)
ax.annotate("R = 90: 1.9M tokens, +1.7%", (90, 1.86),
            textcoords="offset points", xytext=(-10, 26), ha="right",
            fontsize=9, color=INK,
            arrowprops=dict(arrowstyle="-", color=G2, lw=0.8))

h1, l1 = ax.get_legend_handles_labels()
h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, loc="upper right", bbox_to_anchor=(1.0, 0.86))
fig.text(0.0, 1.0, "Same 1 SOL buy, 0.70% fee applied, at every point on the curve. "
         "Early SOL buys about 20x the tokens and moves price about 5x harder.",
         ha="left", va="bottom", fontsize=9.2, color=G1)
fig.tight_layout()
save(fig, "02-front-loading.png")

# ---------------------------------------------------------------- figure 4
delta = np.linspace(0, 25, 300)
fig, ax = plt.subplots(figsize=(9.4, 4.8))
styles = [(100, INK, "solid", 2.0), (200, G1, (0, (5, 2)), 1.6),
          (400, G2, (0, (2, 2)), 1.6)]
for x0, col, ls, lw in styles:
    impact = (((x0 + delta * (1 - F)) / x0) ** 2 - 1) * 100
    ax.plot(delta, impact, color=col, lw=lw, ls=ls,
            label=f"{x0} SOL pool")
for dd in (1, 5, 10, 25):
    imp = (((100 + dd * (1 - F)) / 100) ** 2 - 1) * 100
    ax.plot([dd], [imp], "o", ms=4.5, color=INK, zorder=6)
    ax.annotate(f"+{imp:.1f}%", (dd, imp), textcoords="offset points",
                xytext=(-6, 7), ha="right", fontsize=8.5, color=G1)
ax.set_xlabel("Buy size (SOL)")
ax.set_ylabel("Price impact (%)")
ax.set_title("Impact halves every time the pool doubles")
ax.set_xlim(0, 26)
ax.set_ylim(0, 60)
ax.legend(loc="upper left")
clean_axes(ax)
fig.text(0.0, 1.0, "Spot ratio after a buy is ((x + d')/x)^2 on the real reserve pool. "
         "The opening pool is the full raise, about 100 SOL.",
         ha="left", va="bottom", fontsize=9.2, color=G1)
fig.tight_layout()
save(fig, "04-amm-impact.png")
