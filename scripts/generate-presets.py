"""
generate-presets.py — Builds deterministic, explainable starter plans for the editor and the
Fair Maps gallery from the PL 94-171 tract file.

Presets (all 8 districts, built from census tracts):
  splitline     Recursive straight-line cuts: each cut is the shortest line that divides a
                region's population in the right proportion. Ignores counties and communities.
  equal-pop     Starts from the Most Compact plan, then moves tracts to bring district populations as close to equal as
                possible, with compactness as the tie-breaker.
  compact       Starts from population-balanced round clusters, then minimizes total district boundary length while
                keeping every district within 1% of ideal population.
  counties      Starts from the Most Compact plan, then trades boundary length for fewer split counties
                (within 1% of ideal population).

Partisan data is never an input. The 2020 presidential vote is only used afterwards to report
the seat split each plan would have produced.

Usage: python -I scripts/generate-presets.py
Needs: shapely (pip install shapely numpy)
Writes: data/fair-maps/presets/<id>.geojson and <id>-assignments.json, and updates the
        `plans` list in data/fair-maps/ensemble-metadata.json. Run
        `node scripts/compute-plan-metrics.js` afterwards for the compactness scores.
"""

import json
import math
import random
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

import numpy as np
from shapely.affinity import affine_transform
from shapely.geometry import LineString, shape, mapping
from shapely.ops import unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
TRACTS = ROOT / "data" / "census" / "mo-tracts-2020.geojson"
OUT_DIR = ROOT / "data" / "fair-maps" / "presets"
METADATA = ROOT / "data" / "fair-maps" / "ensemble-metadata.json"

N_DISTRICTS = 8
# Missouri sits near 38.4°N: a degree of longitude is ~cos(38.4°) as long as a degree of
# latitude. Working in km avoids skewed "straight lines" and perimeter lengths.
KM_PER_DEG_LAT = 110.57
KM_PER_DEG_LON = 111.32 * math.cos(math.radians(38.4))
SEED = 2026


# --------------------------------------------------------------------------- data loading

class Tracts:
    """Tract attributes, projected geometry and the rook-adjacency graph with shared edge lengths."""

    def __init__(self):
        data = json.loads(TRACTS.read_text(encoding="utf-8"))
        self.features = data["features"]
        self.n = len(self.features)
        self.geoid = [f["properties"]["geoid"] for f in self.features]
        self.pop = [f["properties"]["population"] for f in self.features]
        self.county = [f["properties"]["county"] for f in self.features]
        self.dem = [f["properties"].get("dem_votes", 0) or 0 for f in self.features]
        self.rep = [f["properties"].get("rep_votes", 0) or 0 for f in self.features]
        self.geom_ll = [shape(f["geometry"]) for f in self.features]
        self.geom = [affine_transform(g, [KM_PER_DEG_LON, 0, 0, KM_PER_DEG_LAT, 0, 0]) for g in self.geom_ll]
        self.centroid = [(g.centroid.x, g.centroid.y) for g in self.geom]
        self.total_pop = sum(self.pop)
        self.ideal = self.total_pop / N_DISTRICTS
        self.adj: list[dict[int, float]] = [dict() for _ in range(self.n)]
        self._build_adjacency()

    def _build_adjacency(self):
        tree = STRtree(self.geom)
        for i, g in enumerate(self.geom):
            for j in tree.query(g):
                j = int(j)
                if j <= i:
                    continue
                shared = g.intersection(self.geom[j]).length
                if shared > 0.001:  # km; ignores corner-only contact
                    self.adj[i][j] = shared
                    self.adj[j][i] = shared
        self._connect_components()

    def _connect_components(self):
        """Joins any stranded tract groups (e.g. across a river) to the nearest tract so the
        graph is one component; the link carries a tiny edge length so it never drives cuts."""
        comps = components(self.adj, range(self.n))
        while len(comps) > 1:
            small = min(comps, key=len)
            rest = [i for c in comps if c is not small for i in c]
            best = min(((a, b) for a in small for b in rest),
                       key=lambda p: dist(self.centroid[p[0]], self.centroid[p[1]]))
            self.adj[best[0]][best[1]] = 0.001
            self.adj[best[1]][best[0]] = 0.001
            print(f"  linked isolated tract group of {len(small)} to the main graph")
            comps = components(self.adj, range(self.n))


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def components(adj, nodes):
    """Connected components of the subgraph induced by `nodes`."""
    nodes = set(nodes)
    seen, out = set(), []
    for s in nodes:
        if s in seen:
            continue
        comp, q = [], deque([s])
        seen.add(s)
        while q:
            u = q.popleft()
            comp.append(u)
            for v in adj[u]:
                if v in nodes and v not in seen:
                    seen.add(v)
                    q.append(v)
        out.append(comp)
    return out


# ---------------------------------------------------------------------------- splitline

def splitline(t: Tracts) -> list[int]:
    """Recursive shortest-splitline partition into N_DISTRICTS groups of tracts."""
    assign = [0] * t.n
    next_id = [0]

    def recurse(units: list[int], n: int):
        if n == 1:
            for i in units:
                assign[i] = next_id[0]
            next_id[0] += 1
            return
        n_a = n // 2
        a, b = best_cut(units, n_a, n)
        recurse(a, n_a)
        recurse(b, n - n_a)

    def best_cut(units: list[int], n_a: int, n: int):
        region = unary_union([t.geom[i] for i in units])
        total = sum(t.pop[i] for i in units)
        target = total * n_a / n
        minx, miny, maxx, maxy = region.bounds
        reach = 2 * math.hypot(maxx - minx, maxy - miny)
        best = None
        for deg in range(180):
            th = math.radians(deg)
            ux, uy = math.cos(th), math.sin(th)       # line direction
            nx, ny = -uy, ux                           # line normal
            order = sorted(units, key=lambda i: t.centroid[i][0] * nx + t.centroid[i][1] * ny)
            run, k = 0, 0
            while k < len(order) and run + t.pop[order[k]] / 2 < target:
                run += t.pop[order[k]]
                k += 1
            k = min(max(k, 1), len(order) - 1)
            lo = t.centroid[order[k - 1]]
            hi = t.centroid[order[k]]
            c = ((lo[0] * nx + lo[1] * ny) + (hi[0] * nx + hi[1] * ny)) / 2
            px, py = c * nx, c * ny                    # a point on the cut line
            line = LineString([(px - ux * reach, py - uy * reach), (px + ux * reach, py + uy * reach)])
            length = region.intersection(line).length
            if best is not None and length >= best[0]:
                continue
            # A straight line through a non-convex region can strand tracts on the wrong side of a
            # river or bend; only accept cuts that leave both halves in one piece.
            if len(components(t.adj, order[:k])) == 1 and len(components(t.adj, order[k:])) == 1:
                best = (length, order[:k], order[k:])
        return best[1], best[2]

    recurse(list(range(t.n)), N_DISTRICTS)
    return assign


# ------------------------------------------------------------ balanced clustering start

def balanced_clusters(t: Tracts, seed: int, outer: int = 40, inner: int = 120) -> list[int]:
    """Population-balanced k-means (a power diagram): each tract goes to the center with the
    smallest `distance^2 - weight`. The inner loop nudges weights until populations equalize for
    the current centers; the outer loop then moves each center to its population-weighted
    centroid. Gives round, compact cells, unlike the long strips repeated straight cuts leave."""
    rng = np.random.default_rng(seed)
    xy = np.array(t.centroid)
    pop = np.array(t.pop, dtype=float)
    centers = xy[rng.choice(t.n, N_DISTRICTS, replace=False, p=pop / pop.sum())]
    weights = np.zeros(N_DISTRICTS)
    scale = ((xy.max(0) - xy.min(0)) ** 2).sum() / N_DISTRICTS
    for _ in range(outer):
        for i in range(inner):
            d2 = ((xy[:, None, :] - centers[None, :, :]) ** 2).sum(-1) - weights[None, :]
            label = d2.argmin(1)
            totals = np.bincount(label, weights=pop, minlength=N_DISTRICTS)
            weights += 0.25 * scale * (t.ideal - totals) / t.ideal * (0.97 ** i)
        for k in range(N_DISTRICTS):
            if totals[k] > 0:
                centers[k] = (xy[label == k] * pop[label == k, None]).sum(0) / totals[k]
    return [int(x) for x in label]


def compact_start(t: Tracts) -> list[int]:
    """Best of several balanced-cluster seeds, judged by boundary length after contiguity repair."""
    best = None
    for seed in range(30):
        plan = Plan(t, balanced_clusters(t, SEED + seed))
        if any(not plan.members[d] for d in range(N_DISTRICTS)):
            continue
        fix_contiguity(plan)
        score = plan.cut + 4000 * plan.max_dev()   # tiebreak toward balanced populations
        if best is None or score < best[0]:
            best = (score, list(plan.assign))
    return best[1]


# ----------------------------------------------------------------------- local search

class Plan:
    """A district assignment with incrementally maintained pop, boundary length and county splits."""

    def __init__(self, t: Tracts, assign: list[int]):
        self.t = t
        self.assign = list(assign)
        self.members = [set() for _ in range(N_DISTRICTS)]
        self.pop = [0] * N_DISTRICTS
        self.county_count = defaultdict(Counter)   # county -> {district: tract count}
        self.cut = 0.0
        for i, d in enumerate(self.assign):
            self.members[d].add(i)
            self.pop[d] += t.pop[i]
            self.county_count[t.county[i]][d] += 1
        for i in range(t.n):
            for j, w in t.adj[i].items():
                if j > i and self.assign[i] != self.assign[j]:
                    self.cut += w

    def splits(self) -> int:
        return sum(len(c) - 1 for c in self.county_count.values())

    def max_dev(self) -> float:
        return max(abs(p - self.t.ideal) for p in self.pop) / self.t.ideal

    def move(self, i: int, e: int):
        """Moves tract i to district e, updating all bookkeeping."""
        t, d = self.t, self.assign[i]
        for j, w in t.adj[i].items():
            dj = self.assign[j]
            self.cut += w * ((dj != e) - (dj != d))
        self.members[d].discard(i)
        self.members[e].add(i)
        self.pop[d] -= t.pop[i]
        self.pop[e] += t.pop[i]
        cc = self.county_count[t.county[i]]
        cc[d] -= 1
        if cc[d] == 0:
            del cc[d]
        cc[e] += 1
        self.assign[i] = e

    def contiguous(self, d: int) -> bool:
        m = self.members[d]
        if not m:
            return False
        start = next(iter(m))
        seen, q = {start}, deque([start])
        while q:
            u = q.popleft()
            for v in self.t.adj[u]:
                if v in m and v not in seen:
                    seen.add(v)
                    q.append(v)
        return len(seen) == len(m)


def fix_contiguity(plan: Plan):
    """Straight cuts through a non-convex state can strand a few tracts on the wrong side of a
    river or bend. Hands each stranded fragment to the neighboring district it borders most."""
    t = plan.t
    for _ in range(50):
        changed = False
        for d in range(N_DISTRICTS):
            comps = components(t.adj, plan.members[d])
            if len(comps) <= 1:
                continue
            comps.sort(key=lambda c: sum(t.pop[i] for i in c), reverse=True)
            for frag in comps[1:]:
                border = Counter()
                for i in frag:
                    for j, w in t.adj[i].items():
                        if plan.assign[j] != d:
                            border[plan.assign[j]] += w
                target = border.most_common(1)[0][0]
                for i in frag:
                    plan.move(i, target)
                changed = True
        if not changed:
            return
    raise RuntimeError("could not make plan contiguous")


def pop_penalty(plan: Plan, cap: float) -> float:
    """Squared overshoot of each district's deviation beyond `cap` (a fraction of ideal)."""
    ideal = plan.t.ideal
    return sum(max(0.0, abs(p - ideal) / ideal - cap) ** 2 for p in plan.pop)


def optimize(plan: Plan, *, w_cut: float, w_split: float, cap: float, p_weight: float,
             iters: int, t_start: float, t_end: float, rng: random.Random, label: str):
    """Simulated annealing over single-tract and whole-county-slice moves.

    cost = w_cut * boundary_km + w_split * county_splits + p_weight * population_penalty(cap)
    A move is rejected outright if it would disconnect or empty the district it leaves.
    """
    t = plan.t
    by_county = defaultdict(list)
    for i in range(t.n):
        by_county[t.county[i]].append(i)

    def cost():
        return w_cut * plan.cut + w_split * plan.splits() + p_weight * pop_penalty(plan, cap)

    cur = cost()
    for step in range(iters):
        temp = t_start * (t_end / t_start) ** (step / iters)
        i = rng.randrange(t.n)
        d = plan.assign[i]
        foreign = [plan.assign[j] for j in t.adj[i] if plan.assign[j] != d]
        if not foreign:
            continue
        e = rng.choice(foreign)

        if w_split and rng.random() < 0.15:
            # Whole-county slice: every tract of i's county currently in district d.
            movers = [k for k in by_county[t.county[i]] if plan.assign[k] == d]
        else:
            movers = [i]
        if len(movers) >= len(plan.members[d]):
            continue

        for k in movers:
            plan.move(k, e)
        new = cost()
        delta = new - cur
        if (delta <= 0 or rng.random() < math.exp(-delta / temp)) and plan.contiguous(d) and plan.contiguous(e):
            cur = new
        else:
            for k in reversed(movers):
                plan.move(k, d)
        if step and step % 200000 == 0:
            print(f"    [{label}] step {step:,}: cut {plan.cut:,.0f} km, splits {plan.splits()}, "
                  f"max dev {plan.max_dev():.3%}")


def repair_population(plan: Plan, cap: float, rng: random.Random):
    """Greedy descent that only accepts moves reducing squared deviation, until within `cap`
    or no such move exists. Used to finish plans whose annealing left some overshoot."""
    t = plan.t
    for _ in range(200):
        if plan.max_dev() <= cap:
            return
        improved = False
        order = list(range(t.n))
        rng.shuffle(order)
        for i in order:
            d = plan.assign[i]
            for e in {plan.assign[j] for j in t.adj[i]} - {d}:
                before = (plan.pop[d] - t.ideal) ** 2 + (plan.pop[e] - t.ideal) ** 2
                after = (plan.pop[d] - t.pop[i] - t.ideal) ** 2 + (plan.pop[e] + t.pop[i] - t.ideal) ** 2
                if after < before and len(plan.members[d]) > 1:
                    plan.move(i, e)
                    if plan.contiguous(d) and plan.contiguous(e):
                        improved = True
                        break
                    plan.move(i, d)
        if not improved:
            return


# ------------------------------------------------------------------------------ output

def finalize(t: Tracts, plan: Plan, preset: dict):
    """Renumbers districts west to east, writes GeoJSON + assignments, returns a metadata entry."""
    order = sorted(range(N_DISTRICTS), key=lambda d: sum(t.centroid[i][0] for i in plan.members[d]) / len(plan.members[d]))
    new_id = {d: k + 1 for k, d in enumerate(order)}
    assignments = {t.geoid[i]: new_id[plan.assign[i]] for i in range(t.n)}

    pops = {new_id[d]: plan.pop[d] for d in range(N_DISTRICTS)}
    seats = {"rep": 0, "dem": 0}
    features = []
    for d in order:
        members = sorted(plan.members[d])
        geom = unary_union([t.geom_ll[i] for i in members]).simplify(0.0008)
        dem, rep = sum(t.dem[i] for i in members), sum(t.rep[i] for i in members)
        seats["rep" if rep > dem else "dem"] += 1
        features.append({
            "type": "Feature",
            "properties": {
                "district": new_id[d],
                "population": plan.pop[d],
                "deviation": round((plan.pop[d] - t.ideal) / t.ideal, 5),
            },
            "geometry": json.loads(json.dumps(mapping(geom))),
        })

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / f"{preset['id']}.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")
    (OUT_DIR / f"{preset['id']}-assignments.json").write_text(
        json.dumps(assignments, separators=(",", ":"), sort_keys=True), encoding="utf-8")

    note = (f"{preset['description']} Result: largest district is {plan.max_dev():.2%} from ideal, "
            f"{plan.splits()} county splits. For reference only, the 2020 presidential vote would have "
            f"produced {seats['rep']}R-{seats['dem']}D; partisan data was not used to draw the plan.")
    return {
        "id": preset["id"],
        "title": preset["title"],
        "source": "Show-Me Districts (algorithmic)",
        "year": 2026,
        "districts": N_DISTRICTS,
        "geoFile": f"presets/{preset['id']}.geojson",
        "assignmentsFile": f"presets/{preset['id']}-assignments.json",
        "metrics": {
            "polsbyPopper": None, "reock": None,
            "populationDeviation": round(plan.max_dev(), 5),
            "efficiencyGap": None, "meanMedian": None,
        },
        "countySplits": plan.splits(),
        "seats2020": seats,
        "note": note,
    }


# -------------------------------------------------------------------------------- main

PRESETS = [
    dict(id="splitline", title="Straight-Line Split",
         description="Each cut is the shortest straight line that divides the population in the right proportion, repeated until there are eight districts. It ignores counties and communities."),
    dict(id="compact", title="Most Compact",
         description="Starts from population-balanced round clusters, then minimizes total district boundary length while keeping every district within 1% of ideal population."),
    dict(id="equal-pop", title="Equal Population",
         description="Starts from the Most Compact plan, then moves tracts to bring district populations as close to equal as possible, keeping shapes tidy."),
    dict(id="counties", title="Keep Counties Whole",
         description="Minimizes the number of split counties (and then boundary length) while keeping every district within 1% of ideal population."),
]


def main():
    print("Loading tracts and building adjacency graph...")
    t = Tracts()
    print(f"  {t.n} tracts, ideal district size {t.ideal:,.0f}")

    print("Computing straight-line split...")
    base = splitline(t)
    base_plan = Plan(t, base)
    fix_contiguity(base_plan)
    base = list(base_plan.assign)
    print(f"  splitline: cut {base_plan.cut:,.0f} km, splits {base_plan.splits()}, max dev {base_plan.max_dev():.2%}")

    print("Finding a compact balanced start (population-weighted clustering)...")
    cstart = compact_start(t)
    cplan = Plan(t, cstart)
    print(f"  cluster start: cut {cplan.cut:,.0f} km, splits {cplan.splits()}, max dev {cplan.max_dev():.2%}")

    results = []
    starts = {"splitline": base}   # equal-pop and counties start from the finished compact plan
    for preset in PRESETS:
        rng = random.Random(SEED)
        pid = preset["id"]
        plan = Plan(t, starts.get(pid, cstart))
        if pid == "compact":
            optimize(plan, w_cut=1.0, w_split=0, cap=0.005, p_weight=5e6, iters=800_000,
                     t_start=15.0, t_end=0.05, rng=rng, label=pid)
            repair_population(plan, 0.01, rng)
            starts["equal-pop"] = starts["counties"] = list(plan.assign)
        elif pid == "equal-pop":
            optimize(plan, w_cut=0.02, w_split=0, cap=0.0002, p_weight=2e8, iters=800_000,
                     t_start=2.0, t_end=0.02, rng=rng, label=pid)
            repair_population(plan, 0.0005, rng)
        elif pid == "counties":
            optimize(plan, w_cut=0.1, w_split=60, cap=0.005, p_weight=5e6, iters=1_500_000,
                     t_start=30.0, t_end=0.3, rng=rng, label=pid)
            repair_population(plan, 0.01, rng)
        for d in range(N_DISTRICTS):
            assert plan.contiguous(d), f"{pid}: district {d} is not contiguous"
        print(f"  {pid}: cut {plan.cut:,.0f} km, splits {plan.splits()}, max dev {plan.max_dev():.3%}")
        results.append(finalize(t, plan, preset))

    meta = json.loads(METADATA.read_text(encoding="utf-8"))
    ids = {r["id"] for r in results}
    meta["plans"] = [p for p in meta["plans"] if p["id"] not in ids] + results
    METADATA.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(results)} presets to {OUT_DIR} and updated {METADATA.name}")


if __name__ == "__main__":
    sys.exit(main())
