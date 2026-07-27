import numpy as np
import matplotlib.pyplot as plt
from fl_style import *

# ---------------------------------------------------------------- figure 3
fig, ax = canvas(10.6, 5.6)
title_block(ax, "Market lifecycle",
            "One buy path, one graduation, one pool. Supply only ever shrinks.")

y0 = 74
a = box(ax, 11, y0, 18, 12, "Buy\n$\\delta$ SOL", weight="semibold")
b = box(ax, 37, y0, 21, 12, "Curve\nvirtual 25 SOL / 1B", weight="semibold")
c = box(ax, 64, y0, 21, 12, "Graduation\nR reaches 100 SOL", weight="semibold",
        dashed=True)
d = box(ax, 90, y0, 17, 12, "AMM live\nx $\\cdot$ y = K", weight="semibold")
for p, q in ((a, b), (b, c), (c, d)):
    connect(ax, p, q)

fee = box(ax, 11, 50, 18, 10, "0.70% fee\noff the SOL leg", fill=G5, edge=G2,
          fontsize=9, textcolor=G1)
connect(ax, a, fee, color=G2)

seed = box(ax, 64, 50, 25, 10, "Full raise seeds the pool\nR SOL vs R / 0.625 tokens",
           fontsize=9)
burn = box(ax, 64, 30, 25, 10, "Unsold curve tokens burn", fontsize=9,
           fill=G5, edge=G2, textcolor=G1)
connect(ax, c, seed)
connect(ax, seed, burn, color=G2, dashed=True)

mark = box(ax, 90, 50, 17, 10, "Mark EMA m\n60s window", fontsize=9)
prem = box(ax, 90, 30, 17, 10, "Premium\nP = m / I $-$ 1", fontsize=9)
connect(ax, d, mark)
connect(ax, mark, prem)

label(ax, 37, 62, "R += $\\delta'$", fontsize=9, color=G1)
label(ax, 37, 50, "spot per unit\n$(25 + R)^2$ / 25000", fontsize=9, color=G1)

label(ax, 0, 12, "Live example: 104.27 SOL raised opened a 104.27 SOL / 156.0M token pool. "
      "The overshoot past 100 is why the opening premium is near zero rather than exactly zero.",
      fontsize=9, color=G1, ha="left")
save(fig, "03-lifecycle.png")

# ---------------------------------------------------------------- figure 5
fig, ax = plt.subplots(figsize=(9.8, 5.2))
t = np.linspace(0, 10, 500)
band = 4.0
path = (7.5 * np.exp(-((t - 1.8) ** 2) / 0.5) - 6.8 * np.exp(-((t - 5.4) ** 2) / 0.6)
        + 5.2 * np.exp(-((t - 8.4) ** 2) / 0.45) + 0.4 * np.sin(3 * t))
ax.axhspan(-band, band, color=G5, zorder=0)
ax.axhline(0, color=G2, lw=0.9, ls=(0, (3, 2)), zorder=1)
ax.plot(t, path, color=INK, lw=1.9, zorder=3)
ax.axhline(band, color=G2, lw=1.0, zorder=2)
ax.axhline(-band, color=G2, lw=1.0, zorder=2)

ax.set_ylim(-11, 11)
ax.set_xlim(0, 10)
ax.set_xticks([])
ax.set_yticks([-8, -4, 0, 4, 8])
ax.set_yticklabels(["$-$8%", "$-$4%", "0", "+4%", "+8%"])
ax.set_ylabel("Premium P = m / I $-$ 1")
ax.set_xlabel("Time")
ax.set_title("Feeless swaps keep the premium inside the impact corridor")
clean_axes(ax, grid=False)

ax.annotate("deposit copies, sell tokens", xy=(1.9, 6.6), xytext=(2.6, 9.4),
            fontsize=9.5, color=INK,
            arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.0))
ax.annotate("buy tokens, redeem copies\n(capped by escrow inventory E)",
            xy=(5.5, -6.0), xytext=(6.0, -9.6), fontsize=9.5, color=INK,
            arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.0))
ax.text(0.15, 0.6, "no arbitrage corridor: width is price impact plus EMA lag",
        fontsize=9, color=G1, va="center")
ax.text(9.85, 4.5, "+ impact", fontsize=8.5, color=G1, ha="right", va="bottom")
ax.text(9.85, -4.5, "$-$ impact", fontsize=8.5, color=G1, ha="right", va="top")
fig.text(0.0, 1.0, "Schematic. The corridor tightens as pool depth grows, since the swap "
         "door itself charges nothing in either direction.",
         ha="left", va="bottom", fontsize=9.2, color=G1)
fig.tight_layout()
save(fig, "05-arb-corridor.png")

# ---------------------------------------------------------------- figure 6
fig, ax = canvas(10.2, 6.4)
title_block(ax, "Transmission into the collectible",
            "How token flow reaches the floor price, and comes back as index.")

nodes = [
    (50, 78, "Net token buying"),
    (81, 60, "Mark m rises,\npremium P turns positive"),
    (81, 32, "Arb sources the cheapest\nfloor asks on the marketplace"),
    (50, 14, "Copies lock in escrow,\ntradable float shrinks"),
    (19, 32, "Floor price C rises along\nthe marketplace ask depth"),
    (19, 60, "Oracle pushes\nI = 0.625 $\\cdot$ C / C$_0$"),
]
boxes = []
for i, (x, y, txt) in enumerate(nodes):
    w = 34 if i in (1, 2, 4) else 30
    boxes.append(box(ax, x, y, w, 13, txt, fontsize=9.2))
for i in range(6):
    connect(ax, boxes[i], boxes[(i + 1) % 6], rad=-0.12)

label(ax, 50, 47, "the loop closes\nin about 5 minutes", fontsize=9, color=G2,
      weight="semibold")
label(ax, 24, 75, "fair value up,\nheadroom reopens", fontsize=8.5, color=G2)
label(ax, 0, 2, "Upside is limited only by how many asks the marketplace has listed. "
      "Thin collectibles move hard, deep ones move slowly.",
      fontsize=9, color=G1, ha="left")
save(fig, "06-transmission-loop.png")

# ---------------------------------------------------------------- figure 7
fig, ax = plt.subplots(figsize=(8.8, 5.2))
xs = [0, 1]
heights = [100, 40]
ax.bar(xs, heights, width=0.46, color=[G5, G5], edgecolor=INK, linewidth=1.2,
       zorder=3)
# open top on the upside bar
ax.plot([-0.23, 0.23], [100, 100], color=WHITE, lw=3.0, zorder=4)
ax.plot([-0.23, 0.23], [100, 100], color=INK, lw=1.2, ls=(0, (2, 2)), zorder=5)
for yy in (106, 112):
    ax.plot([-0.23, 0.23], [yy, yy], color=G3, lw=1.0, ls=(0, (2, 3)), zorder=3)
ax.annotate("", xy=(0, 122), xytext=(0, 112),
            arrowprops=dict(arrowstyle="-|>", color=INK, lw=1.4))
# hard cap on the downside bar
ax.plot([0.77, 1.23], [40, 40], color=INK, lw=3.4, zorder=6, solid_capstyle="butt")

ax.set_xticks(xs)
ax.set_xticklabels(["Upside\nbuys lock copies, float shrinks, floor rises",
                    "Downside\nsells release copies, floor is pressed"],
                   fontsize=10)
ax.tick_params(axis="x", length=0, pad=10)
ax.set_ylabel("Copies the channel can move")
ax.set_ylim(0, 132)
ax.set_xlim(-0.6, 1.6)
ax.set_yticks([0, 20, 40, 60, 80, 100])
ax.set_title("The asymmetry: a ratchet on the collectible's float")
clean_axes(ax)
ax.text(0, 60, "no ceiling except\nthe marketplace float", ha="center",
        fontsize=9.5, color=INK, zorder=6)
ax.text(1, 20, "capped at E,\nthe copies escrow holds", ha="center",
        fontsize=9.5, color=INK, zorder=7)
ax.annotate("a market that absorbed 40 copies\non the way up can release at most 40",
            xy=(1.24, 40), xytext=(1.32, 74), fontsize=9, color=G1, ha="center",
            arrowprops=dict(arrowstyle="-|>", color=G2, lw=0.9,
                            connectionstyle="arc3,rad=0.25"))
fig.text(0.0, 1.0, "Illustrative heights. The point is the shape: upside capacity is set "
         "outside the protocol, downside capacity is set by what the pool already absorbed.",
         ha="left", va="bottom", fontsize=9.2, color=G1)
fig.tight_layout()
save(fig, "07-asymmetry.png")

# ---------------------------------------------------------------- figure 8
fig, ax = canvas(9.6, 4.8)
title_block(ax, "Fee and value flows",
            "Every SOL leg pays 70 bps. The real item door pays nothing.")

v = box(ax, 15, 62, 24, 12, "1,000 SOL\nof trade volume", weight="semibold")
f = box(ax, 48, 62, 20, 12, "7 SOL\nin fees", weight="semibold")
r1 = box(ax, 84, 78, 28, 11, "3.5 SOL to the market's\nfee receiver", fontsize=9)
r2 = box(ax, 84, 48, 28, 11, "3.5 SOL to the\nprotocol treasury", fontsize=9)
connect(ax, v, f)
connect(ax, f, r1, rad=-0.1)
connect(ax, f, r2, rad=0.1)

sw = box(ax, 15, 28, 24, 11, "Item swaps\n0 fee", fontsize=9, fill=G5, edge=G2,
         textcolor=G1)
ln = box(ax, 48, 28, 20, 11, "Each launch\n0.1 SOL flat", fontsize=9)
connect(ax, ln, r2, rad=-0.12, color=G2, dashed=True)

label(ax, 0, 8, "Deliberate: the SOL paths are taxed and the real item path is not, "
      "so the arbitrage that ties the token to the floor is never taxed.\n"
      "The fee receiver can be an identity escrow for a community figure.",
      fontsize=9, color=G1, ha="left")
save(fig, "08-fee-flows.png")
