"""
Score Phase 1 eval results.

Reads results/raw_runs.csv and emits:
  - results/scored_comparison.csv  — FCR@bucket + latency P50 per (adapter, param)
  - results/pareto.png             — latency-vs-FCR Pareto frontier per adapter
  - results/summary.txt            — human-readable table
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

matplotlib.use("Agg")  # headless

logger = logging.getLogger(__name__)

_RESULTS_DIR = Path(__file__).parent / "results"
_RAW_CSV = _RESULTS_DIR / "raw_runs.csv"
_SCORED_CSV = _RESULTS_DIR / "scored_comparison.csv"
_PARETO_PNG = _RESULTS_DIR / "pareto.png"
_SUMMARY_TXT = _RESULTS_DIR / "summary.txt"


def _pareto_frontier(df_pts: pd.DataFrame) -> pd.DataFrame:
    """
    Return the Pareto-optimal rows from a DataFrame with columns [fcr, latency_p50].
    Lower fcr and lower latency_p50 are both better.
    """
    dominated = []
    rows = df_pts.to_dict("records")
    for i, a in enumerate(rows):
        for j, b in enumerate(rows):
            if i == j:
                continue
            if b["fcr"] <= a["fcr"] and b["latency_p50"] <= a["latency_p50"] and (
                b["fcr"] < a["fcr"] or b["latency_p50"] < a["latency_p50"]
            ):
                dominated.append(i)
                break
    pareto_idx = [i for i in range(len(rows)) if i not in dominated]
    return df_pts.iloc[pareto_idx].sort_values("fcr")


def score(raw_csv: Path = _RAW_CSV) -> pd.DataFrame:
    if not raw_csv.exists():
        logger.error("raw_runs.csv not found at %s — run run_offline.py first", raw_csv)
        sys.exit(1)

    df = pd.read_csv(raw_csv)
    logger.info("Loaded %d rows from %s", len(df), raw_csv)

    # Replace empty strings with NaN
    df["latency_ms"] = pd.to_numeric(df["latency_ms"], errors="coerce")
    df["fired_at_ms"] = pd.to_numeric(df["fired_at_ms"], errors="coerce")

    # Ensure integer columns are int
    for col in ["fired", "false_cutoff", "true_eot", "missed_eot", "true_hold", "is_complete"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    scored_rows: list[dict] = []

    # Group by (adapter, param_key, bucket)
    for (adapter, param_key, bucket), grp in df.groupby(["adapter", "param_key", "bucket"]):
        n_complete = int(grp["is_complete"].sum())
        n_incomplete = int((1 - grp["is_complete"]).sum())
        n_total = len(grp)

        # FCR = false cutoffs / total incomplete clips in this bucket
        n_false_cutoffs = int(grp["false_cutoff"].sum())
        fcr = n_false_cutoffs / n_incomplete if n_incomplete > 0 else float("nan")

        # True EOT detection rate (among complete clips)
        n_true_eot = int(grp["true_eot"].sum())
        eot_rate = n_true_eot / n_complete if n_complete > 0 else float("nan")

        # Latency stats (only true EOT events)
        lat_vals = grp.loc[grp["true_eot"] == 1, "latency_ms"].dropna()
        lat_p50 = float(lat_vals.quantile(0.50)) if len(lat_vals) > 0 else float("nan")
        lat_p90 = float(lat_vals.quantile(0.90)) if len(lat_vals) > 0 else float("nan")

        # Wall time
        wall_p50 = float(grp["wall_ms"].astype(float).quantile(0.50))

        scored_rows.append(
            {
                "adapter": adapter,
                "param_key": param_key,
                "bucket": bucket,
                "n_clips": n_total,
                "n_complete": n_complete,
                "n_incomplete": n_incomplete,
                "n_false_cutoffs": n_false_cutoffs,
                "fcr": round(fcr, 4) if not np.isnan(fcr) else "",
                "n_true_eot": n_true_eot,
                "eot_rate": round(eot_rate, 4) if not np.isnan(eot_rate) else "",
                "latency_p50_ms": round(lat_p50, 1) if not np.isnan(lat_p50) else "",
                "latency_p90_ms": round(lat_p90, 1) if not np.isnan(lat_p90) else "",
                "wall_p50_ms": round(wall_p50, 1),
            }
        )

    scored = pd.DataFrame(scored_rows)
    scored.to_csv(_SCORED_CSV, index=False)
    logger.info("Scored table written to %s (%d rows)", _SCORED_CSV, len(scored))

    return scored


def build_pareto(scored: pd.DataFrame) -> None:
    """Build and save latency-vs-FCR Pareto plot per adapter."""
    # Aggregate across buckets to get an "overall" FCR and latency per (adapter, param)
    df_num = scored.copy()
    for col in ["fcr", "latency_p50_ms"]:
        df_num[col] = pd.to_numeric(df_num[col], errors="coerce")

    agg = (
        df_num.groupby(["adapter", "param_key"])
        .agg(
            fcr=("fcr", "mean"),
            latency_p50=("latency_p50_ms", "mean"),
            n_clips=("n_clips", "sum"),
        )
        .reset_index()
        .dropna(subset=["fcr", "latency_p50"])
    )

    adapters = agg["adapter"].unique()
    _ADAPTER_COLORS = {
        "silero_vad": "#e84a27",   # ember
        "smart_turn_v3": "#2563eb",  # blue
    }
    default_color = "#666"

    fig, ax = plt.subplots(figsize=(9, 6))
    ax.set_xlabel("False-Cutoff Rate (FCR) — lower is better →", fontsize=12)
    ax.set_ylabel("EOT Latency P50 (ms) — lower is better →", fontsize=12)
    ax.set_title("Latency vs FCR Pareto — Phase 1 Offline Bake-off", fontsize=13)

    pareto_rows: list[dict] = []

    for adapter in adapters:
        sub = agg[agg["adapter"] == adapter].copy()
        color = _ADAPTER_COLORS.get(str(adapter), default_color)

        ax.scatter(
            sub["fcr"],
            sub["latency_p50"],
            label=f"{adapter} (all params)",
            color=color,
            alpha=0.45,
            s=40,
        )

        # Pareto frontier for this adapter
        pf = _pareto_frontier(sub[["fcr", "latency_p50", "param_key"]].rename(
            columns={"latency_p50": "latency_p50"}
        ))
        if len(pf) > 1:
            ax.plot(
                pf["fcr"],
                pf["latency_p50"],
                color=color,
                linewidth=2,
                label=f"{adapter} Pareto frontier",
            )
        for _, row in pf.iterrows():
            pareto_rows.append(
                {"adapter": adapter, "param_key": row["param_key"],
                 "fcr": row["fcr"], "latency_p50_ms": row["latency_p50"]}
            )

    # Mark FCR=10% operating point
    ax.axvline(x=0.10, color="gray", linestyle="--", linewidth=1, label="FCR=10% target")

    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    fig.savefig(_PARETO_PNG, dpi=150)
    plt.close(fig)
    logger.info("Pareto plot saved to %s", _PARETO_PNG)

    # Write pareto frontier CSV
    pd.DataFrame(pareto_rows).to_csv(_RESULTS_DIR / "pareto_frontier.csv", index=False)


def print_summary(scored: pd.DataFrame) -> str:
    """Print and return a human-readable summary table."""
    lines: list[str] = []
    lines.append("=" * 80)
    lines.append("PHASE 1 VOICE TURN BAKE-OFF — SCORED RESULTS")
    lines.append("=" * 80)
    lines.append("")

    # Overall FCR per (adapter, param) — average across buckets where n_incomplete > 0
    df_num = scored.copy()
    df_num["fcr"] = pd.to_numeric(df_num["fcr"], errors="coerce")
    df_num["latency_p50_ms"] = pd.to_numeric(df_num["latency_p50_ms"], errors="coerce")
    df_num["n_incomplete"] = pd.to_numeric(df_num["n_incomplete"])

    overall = (
        df_num[df_num["n_incomplete"] > 0]
        .groupby(["adapter", "param_key"])
        .agg(
            fcr_mean=("fcr", "mean"),
            lat_p50=("latency_p50_ms", "mean"),
            n_clips=("n_clips", "sum"),
        )
        .reset_index()
        .sort_values(["adapter", "fcr_mean"])
    )

    lines.append(f"{'ADAPTER':<20} {'PARAM':<40} {'FCR(mean)':<12} {'LAT_P50(ms)':<14} {'N_CLIPS'}")
    lines.append("-" * 100)
    for _, row in overall.iterrows():
        fcr_str = f"{row['fcr_mean']:.3f}" if not pd.isna(row["fcr_mean"]) else "  N/A "
        lat_str = f"{row['lat_p50']:.0f}" if not pd.isna(row["lat_p50"]) else "  N/A "
        lines.append(
            f"{row['adapter']:<20} {row['param_key']:<40} {fcr_str:<12} {lat_str:<14} {int(row['n_clips'])}"
        )

    lines.append("")
    lines.append("BY BUCKET (FCR):")
    lines.append("-" * 80)

    # Per-bucket breakdown
    pivot = df_num[df_num["n_incomplete"] > 0].pivot_table(
        index=["adapter", "param_key"],
        columns="bucket",
        values="fcr",
        aggfunc="mean",
    ).reset_index()
    lines.append(pivot.to_string(index=False))

    lines.append("")
    lines.append(f"Full scored CSV:  {_SCORED_CSV}")
    lines.append(f"Pareto plot:      {_PARETO_PNG}")
    lines.append("=" * 80)

    summary = "\n".join(lines)
    print(summary)
    _SUMMARY_TXT.write_text(summary)
    logger.info("Summary written to %s", _SUMMARY_TXT)
    return summary


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        datefmt="%H:%M:%S",
    )
    scored = score()
    build_pareto(scored)
    print_summary(scored)


if __name__ == "__main__":
    main()
