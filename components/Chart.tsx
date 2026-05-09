"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type IPriceLine,
  LineStyle,
  LineType,
  CrosshairMode,
} from "lightweight-charts";

type Props = {
  livePrice: number | null;
  strike: number | null;
  startMs: number;
  endMs: number;
  theme?: "modern" | "terminal";
};

const COLORS = {
  modern: { line: "#f7931a", text: "#9aa3b2", grid: "#1a1d24", target: "#9aa3b2" },
  terminal: { line: "#ffb000", text: "#aa7400", grid: "#3a2a00", target: "#ffd060" },
};

export default function Chart({ livePrice, strike, startMs, endMs, theme = "modern" }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const strikeLineRef = useRef<IPriceLine | null>(null);
  const pulseRef = useRef<HTMLDivElement | null>(null);
  const lastPointRef = useRef<{ time: UTCTimestamp; value: number } | null>(null);
  const livePriceRef = useRef<number | null>(null);
  const strikeRef = useRef<number | null>(null);
  const displayedRef = useRef<number | null>(null);
  const lastAdvanceRef = useRef<number>(0);
  const windowRef = useRef<{ startSec: number; endSec: number }>({ startSec: 0, endSec: 0 });

  // keep refs in sync with props
  livePriceRef.current = livePrice;
  strikeRef.current = strike;
  windowRef.current = {
    startSec: Math.floor(startMs / 1000),
    endSec: Math.floor(endMs / 1000),
  };

  const positionPulse = () => {
    const lp = lastPointRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    const el = pulseRef.current;
    const root = ref.current;
    if (!lp || !chart || !series || !el || !root) return;
    const x = chart.timeScale().timeToCoordinate(lp.time);
    const y = series.priceToCoordinate(lp.value);
    if (x == null || y == null) {
      el.style.opacity = "0";
      return;
    }
    const RIGHT_AXIS_PX = 64;
    const maxX = root.clientWidth - RIGHT_AXIS_PX - 8;
    const cx = Math.min(x, maxX);
    el.style.transform = `translate(${cx}px, ${y}px)`;
    el.style.opacity = "1";
  };

  // mount: create chart + rAF loop (runs forever)
  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: COLORS[theme].text,
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: COLORS[theme].grid } },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderVisible: false,
        rightOffset: 0,
        shiftVisibleRangeOnNewBar: false,
        lockVisibleTimeRangeOnResize: true,
      },
      rightPriceScale: { visible: true, borderVisible: false },
      leftPriceScale: { visible: false },
      localization: {
        priceFormatter: (p: number) =>
          `$${p.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScale: false,
      handleScroll: false,
    });
    const series: ISeriesApi<"Line"> = chart.addLineSeries({
      color: COLORS[theme].line,
      lineWidth: 2,
      lineType: LineType.Simple,
      priceLineVisible: false,
      lastValueVisible: false,
      pointMarkersVisible: false,
      crosshairMarkerVisible: false,
    });
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.25, bottom: 0.25 } });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => positionPulse());
    if (ref.current) ro.observe(ref.current);

    let raf = 0;
    let lastRange = 0;
    const EASE = 0.04; // gentle vertical glide

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const series2 = seriesRef.current;
      if (!series2) return;
      const target = livePriceRef.current;
      if (target == null) return;
      if (displayedRef.current == null) displayedRef.current = target;
      displayedRef.current += (target - displayedRef.current) * EASE;

      // integer-second timestamps; same-second updates replace bar in place,
      // new second appends a new bar — line tip glides vertically each frame,
      // advances 1px-ish horizontally per real second.
      const t = Math.floor(Date.now() / 1000) as UTCTimestamp;
      try {
        series2.update({ time: t, value: displayedRef.current });
        lastPointRef.current = { time: t, value: displayedRef.current };
      } catch {}

      const now = performance.now();
      if (now - lastRange > 500) {
        lastRange = now;
        try {
          chart.timeScale().setVisibleRange({
            from: windowRef.current.startSec as UTCTimestamp,
            to: (windowRef.current.endSec + 120) as UTCTimestamp,
          });
        } catch {}
      }
      positionPulse();
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      chart.remove();
    };
  }, [theme]);

  // round change: backfill candles, reset state, lock window
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const startSec = Math.floor(startMs / 1000);
    const endSec = Math.floor(endMs / 1000);
    displayedRef.current = null;
    lastAdvanceRef.current = 0;
    series.setData([{ time: startSec as UTCTimestamp } as never]);

    let cancelled = false;
    fetch(`/api/prices?round=${Math.floor(startMs / 1000)}`)
      .then((r) => r.json())
      .then((rows: { ts: number; p: number }[]) => {
        if (cancelled || !Array.isArray(rows)) return;
        const data = rows
          .map((row) => ({
            time: Math.floor(row.ts / 1000) as UTCTimestamp,
            value: Number(row.p),
          }))
          .filter((d) => Number.isFinite(d.value) && d.value > 0);
        if (!data.length) return;
        const merged: unknown[] = [];
        if (Number(data[0].time) > startSec) merged.push({ time: startSec as UTCTimestamp });
        merged.push(...data);
        series.setData(merged as never);
      })
      .catch(() => {});

    try {
      chart.timeScale().setVisibleRange({
        from: startSec as UTCTimestamp,
        to: endSec as UTCTimestamp,
      });
    } catch {}

    return () => {
      cancelled = true;
    };
  }, [startMs, endMs]);

  // strike line
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (strikeLineRef.current) {
      series.removePriceLine(strikeLineRef.current);
      strikeLineRef.current = null;
    }
    if (strike != null) {
      strikeLineRef.current = series.createPriceLine({
        price: strike,
        color: "#9aa3b2",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Target",
      });
    }
  }, [strike]);

  return (
    <div className="relative h-72 w-full">
      <div ref={ref} className="absolute inset-0" />
      <div
        ref={pulseRef}
        className="pointer-events-none absolute left-0 top-0 z-10 transition-opacity"
        style={{ opacity: 0, transform: "translate(-9999px,-9999px)" }}
      >
        <span
          className="absolute -left-1.5 -top-1.5 block h-3 w-3 rounded-full"
          style={{ background: COLORS[theme].line }}
        />
        <span
          className="absolute -left-1.5 -top-1.5 block h-3 w-3 rounded-full opacity-70 animate-ping"
          style={{ background: COLORS[theme].line }}
        />
      </div>
    </div>
  );
}
