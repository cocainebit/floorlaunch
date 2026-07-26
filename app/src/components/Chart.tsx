import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { fetchCandles, fetchIndex, type Candle, type IndexTick, type Trade } from "../api";
import { COLORS } from "../config";

const TFS = [
  { label: "15s", secs: 15 },
  { label: "1m", secs: 60 },
  { label: "5m", secs: 300 },
  { label: "1h", secs: 3600 },
];

// Chart shows SOL per unit (1M tokens = 1 floor) so candles and the
// oracle index share one readable scale.
const PER_UNIT = 1_000_000;

interface Props {
  market: string;
  lastTrade: Trade | null;
  lastIndexTick: IndexTick | null;
}

export default function Chart({ market, lastTrade, lastIndexTick }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const indexRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastCandle = useRef<Candle | null>(null);
  const [tf, setTf] = useState(15);
  const tfRef = useRef(tf);
  tfRef.current = tf;

  useEffect(() => {
    if (!holder.current) return;
    const chart = createChart(holder.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "#101318" },
        textColor: "#8b95a6",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#1a1e25" },
        horzLines: { color: "#1a1e25" },
      },
      rightPriceScale: { borderColor: "#232833" },
      timeScale: {
        borderColor: "#232833",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 4,
      },
      crosshair: {
        vertLine: { color: "#3a4150", labelBackgroundColor: "#2a303c" },
        horzLine: { color: "#3a4150", labelBackgroundColor: "#2a303c" },
      },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "transparent",
      borderUpColor: COLORS.up,
      wickUpColor: COLORS.up,
      downColor: COLORS.down,
      borderDownColor: COLORS.down,
      wickDownColor: COLORS.down,
      priceFormat: { type: "price", precision: 3, minMove: 0.001 },
    });
    const index = chart.addSeries(LineSeries, {
      color: COLORS.index,
      lineWidth: 2,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    });
    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      color: "#2a303c",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    chartRef.current = chart;
    candleRef.current = candles;
    indexRef.current = index;
    volRef.current = vol;
    return () => chart.remove();
  }, []);

  // Load history whenever market or timeframe changes.
  useEffect(() => {
    let dead = false;
    (async () => {
      const [cs, ix] = await Promise.all([
        fetchCandles(market, tf),
        fetchIndex(market),
      ]);
      if (dead || !candleRef.current) return;
      candleRef.current.setData(
        cs.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open * PER_UNIT,
          high: c.high * PER_UNIT,
          low: c.low * PER_UNIT,
          close: c.close * PER_UNIT,
        }))
      );
      volRef.current!.setData(
        cs.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? "#1f3d31" : "#3d2523",
        }))
      );
      const seen = new Set<number>();
      const line = ix
        .filter((t) => (seen.has(t.ts) ? false : (seen.add(t.ts), true)))
        .map((t) => ({ time: t.ts as UTCTimestamp, value: t.value * PER_UNIT }));
      indexRef.current!.setData(line);
      lastCandle.current = cs[cs.length - 1] ?? null;
      chartRef.current!.timeScale().scrollToRealTime();
    })();
    return () => {
      dead = true;
    };
  }, [market, tf]);

  // Live candle updates from the WS trade stream.
  useEffect(() => {
    if (!lastTrade || !candleRef.current) return;
    const t = lastTrade;
    const tfSecs = tfRef.current;
    const bucket = Math.floor(t.ts / tfSecs) * tfSecs;
    let c = lastCandle.current;
    if (!c || c.time < bucket) {
      c = {
        time: bucket,
        open: t.priceSol,
        high: t.priceSol,
        low: t.priceSol,
        close: t.priceSol,
        volume: t.solAmount,
        trades: 1,
      };
    } else {
      c = {
        ...c,
        high: Math.max(c.high, t.priceSol),
        low: Math.min(c.low, t.priceSol),
        close: t.priceSol,
        volume: c.volume + t.solAmount,
        trades: c.trades + 1,
      };
    }
    lastCandle.current = c;
    candleRef.current.update({
      time: c.time as UTCTimestamp,
      open: c.open * PER_UNIT,
      high: c.high * PER_UNIT,
      low: c.low * PER_UNIT,
      close: c.close * PER_UNIT,
    });
    volRef.current!.update({
      time: c.time as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? "#1f3d31" : "#3d2523",
    });
  }, [lastTrade]);

  // Live index line updates.
  useEffect(() => {
    if (!lastIndexTick || !indexRef.current) return;
    indexRef.current.update({
      time: lastIndexTick.ts as UTCTimestamp,
      value: lastIndexTick.value * PER_UNIT,
    });
  }, [lastIndexTick]);

  return (
    <div className="chart-card card">
      <div className="chart-toolbar">
        <div className="tf-group">
          {TFS.map((t) => (
            <button
              key={t.secs}
              className={`tf-btn ${tf === t.secs ? "active" : ""}`}
              onClick={() => setTf(t.secs)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-candle" /> Price
          </span>
          <span className="legend-item">
            <span className="legend-line" /> Floor index
          </span>
          <span className="legend-unit">SOL per unit · 1M tokens = 1 floor · charting by TradingView</span>
        </div>
      </div>
      <div className="chart-holder" ref={holder} />
    </div>
  );
}
