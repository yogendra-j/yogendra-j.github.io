---
title: "Geohash Proximity Search in Python: Grids, Neighbors, Precision"
date: 2023-08-13 00:00:00 +0530
categories: [system-design, python]
tags: [geohash, geospatial, proximity-search, python, postgis, redis]
description: Index points by geohash, look up the query cell plus its 8 neighbors, then filter by true distance. Python code, precision table, edge cases, PostGIS and Redis.
image:
  path: /assets/img/og/posts/geohash.jpg
  alt: "Geohash Proximity Search in Python: Grids, Neighbors, Precision"
---

**TL;DR:** A geohash turns latitude and longitude into one sortable string, so "what is near me" becomes a lookup of a few grid cells instead of a scan of every point. Pick a precision whose cells are at least as large as your search radius, fetch the point's cell and its 8 neighbors, then filter the candidates by real distance. In production, use PostGIS or Redis `GEOSEARCH`, which already do this.

## The problem

Given a location, find every item (restaurants, drivers, stores) within some radius. A ride-hailing app might search 500 m, widen the radius if nothing turns up, and give up past an acceptable limit.

## Baseline: scan everything

Compute the distance to every item and keep the close ones. On a sphere that distance is the haversine formula. This demo uses a flat 10,000 x 10,000 grid and Euclidean distance to keep the idea visible.

```python
import math
import random

items = [(random.randint(0, 9999), random.randint(0, 9999)) for _ in range(3_000_000)]
threshold = 100
client_x, client_y = 5000, 5000

def euclidean_distance(x1, y1, x2, y2):
    return math.hypot(x1 - x2, y1 - y2)

nearby = [p for p in items if euclidean_distance(client_x, client_y, *p) <= threshold]
```

This is O(n) per query. Sorting by x alone does not help much, because two points with close x values can still be far apart in y. We need one key that keeps both dimensions close together.

## The idea: interleave the bits

Interleave the bits of x and y into one integer: x bits at even positions, y bits at odd positions. This is a Z-order (Morton) code. Points whose codes share their high bits fall in the same square cell, and dropping the lowest `2k` bits gives the cell ID for a grid of `2^k x 2^k` squares.

Code for the experiment: [notebook on GitHub](https://github.com/yogendra-j/small-experiments/blob/6311724f99aa105eca9b3a04c4c7c7a7f6f7976f/geohash-impl/proximirt-service.ipynb).

```python
from collections import defaultdict

def interleave(x, y):
    result = 0
    for i in range(32):
        result |= ((x & (1 << i)) << i) | ((y & (1 << i)) << (i + 1))
    return result >> 4  # drop 2 bits of x and 2 of y: 4 x 4 cells

# Build once: cell ID -> points in that cell
grids = defaultdict(list)
for item in items:
    grids[interleave(*item)].append(item)

# Query: every cell that can hold a point within the threshold
CELL = 4
reach = math.ceil(threshold / CELL)  # 25 cells in each direction
candidates = []
for dx in range(-reach, reach + 1):
    for dy in range(-reach, reach + 1):
        key = interleave(client_x + dx * CELL, client_y + dy * CELL)
        candidates.extend(grids.get(key, []))

# Cells are squares and the search area is a circle, so filter again
found = [p for p in candidates if euclidean_distance(client_x, client_y, *p) <= threshold]
```

Adding `CELL` to x moves one cell right, and adding it to y moves one cell up. Looping over `-reach..reach` in both directions covers every cell that can hold a point within the threshold. The final filter is required, because the corners of the square of cells lie outside the circle.

One run on CPython with 3 million points (timings vary by machine; the results matched the scan exactly):

| Step | Time | Points examined |
| --- | --- | --- |
| Linear scan | 0.75 s | 3,000,000 |
| Build the grid index (once) | 13.8 s | 3,000,000 |
| Grid query | 0.010 s | 1,251 candidates, 941 matches |

Each query is about 75 times faster, but building the index costs about 18 scans. The index only pays off when it is reused across many queries and updated incrementally as points move.

## From grid cells to geohashes

A geohash applies the same interleaving to longitude and latitude. It halves the longitude range, then the latitude range, and so on, and each halving produces one bit. Every 5 bits become one base32 character. The alphabet `0123456789bcdefghjkmnpqrstuvwxyz` is in ASCII order, so sorting geohash strings sorts by cell, and every cell is a contiguous prefix range. That is what makes geohashes work with an ordinary B-tree index.

```python
BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

def encode(lat: float, lon: float, precision: int = 7) -> str:
    lat_lo, lat_hi, lon_lo, lon_hi = -90.0, 90.0, -180.0, 180.0
    out, ch, bit, use_lon = [], 0, 0, True  # bits alternate, longitude first
    while len(out) < precision:
        if use_lon:
            mid = (lon_lo + lon_hi) / 2
            ch = ch << 1 | (lon >= mid)
            lon_lo, lon_hi = (mid, lon_hi) if lon >= mid else (lon_lo, mid)
        else:
            mid = (lat_lo + lat_hi) / 2
            ch = ch << 1 | (lat >= mid)
            lat_lo, lat_hi = (mid, lat_hi) if lat >= mid else (lat_lo, mid)
        use_lon = not use_lon
        bit += 1
        if bit == 5:  # every 5 bits become one base32 character
            out.append(BASE32[ch])
            ch, bit = 0, 0
    return "".join(out)

assert encode(57.64911, 10.40744, 11) == "u4pruydqqvj"
```

### Precision table

Cell size at the equator. Cell height stays the same at any latitude; cell width shrinks with `cos(latitude)` (about 62% of the equator value in London, 50% at 60 degrees).

| Length | Cell width x height | Typical use |
| --- | --- | --- |
| 1 | 5,009 km x 4,976 km | |
| 2 | 1,252 km x 622 km | |
| 3 | 157 km x 155 km | Region |
| 4 | 39.1 km x 19.4 km | Metro area |
| 5 | 4.9 km x 4.9 km | City district |
| 6 | 1.2 km x 0.61 km | Neighborhood, "within 500 m" |
| 7 | 153 m x 152 m | Street block |
| 8 | 38.2 m x 19.0 m | Building |
| 9 | 4.8 m x 4.7 m | |
| 10 | 1.2 m x 0.59 m | |
| 11 | 149 mm x 148 mm | |
| 12 | 37 mm x 19 mm | |

Odd lengths give roughly square cells. Even lengths give cells twice as wide as they are tall, because longitude gets the extra bit.

## The boundary problem: always query 9 cells

A shared prefix means two points are in the same cell. A different prefix says nothing about distance. These two points near Greenwich are 208 m apart:

| Point | Geohash (7) |
| --- | --- |
| 51.4779, -0.0015 | `gcpuzgq` |
| 51.4779, 0.0015 | `u10hb53` |

They share no characters, because the prime meridian is the first longitude split. The same thing happens, on a smaller scale, at every cell edge. A user standing near the edge of a cell has neighbors just across it, so prefix matching alone silently misses nearby results.

The fix: choose a precision whose cells are at least as large as the radius, then search the point's cell plus the 8 around it. Any point within the radius must lie in one of those 9 cells.

```python
import math

def cell_size(precision: int) -> tuple[float, float]:
    """Height and width of one cell, in degrees."""
    bits = precision * 5
    return 180 / 2 ** (bits // 2), 360 / 2 ** ((bits + 1) // 2)

def neighbors(lat: float, lon: float, precision: int) -> set[str]:
    """The cell containing (lat, lon) plus its 8 neighbors."""
    dlat, dlon = cell_size(precision)
    return {
        encode(max(-90.0, min(90.0, lat + i * dlat)),
               (lon + j * dlon + 180) % 360 - 180,  # wrap at the antimeridian
               precision)
        for i in (-1, 0, 1)
        for j in (-1, 0, 1)
    }

def precision_for(radius_m: float, lat: float) -> int:
    """Longest geohash whose cells are at least radius_m tall and wide here."""
    for p in range(12, 0, -1):
        dlat, dlon = cell_size(p)
        height = dlat * 110_574
        width = dlon * 111_320 * math.cos(math.radians(lat))
        if min(height, width) >= radius_m:
            return p
    return 1

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(a))

def nearby(index: dict, precision: int, lat: float, lon: float, radius_m: float):
    """index maps a geohash of `precision` characters to a list of (lat, lon)."""
    assert precision_for(radius_m, lat) >= precision, "radius too large for this index"
    candidates = (p for cell in neighbors(lat, lon, precision) for p in index.get(cell, []))
    return [p for p in candidates if haversine_m(lat, lon, *p) <= radius_m]
```

Checked against a brute-force haversine scan on 200,000 random points around London: identical results at 50 random query locations.

## Where this still breaks

| Issue | What happens | Mitigation |
| --- | --- | --- |
| Uneven density | A city-center cell holds thousands of points, a rural cell holds none | Expand the radius in steps, cap results, or use finer precision in dense areas |
| Square cells, circular search | 9 cells cover far more area than the circle | Always run the exact-distance filter |
| High latitudes | Cells get narrow, so a fixed precision covers less width | Choose precision per query latitude, as `precision_for` does |
| Antimeridian and poles | Longitude wraps, latitude clamps | Wrap and clamp in the neighbor calculation |
| Moving objects | Every location update moves a point between cells | Use a store with cheap updates (a Redis sorted set), and expire stale positions |
| Nearest-k queries | A fixed radius returns too many or zero results | Grow the ring of cells until you have k results, then sort by distance |

## In production: use what already exists

### PostGIS

Use a `geography` column with a GiST index. `ST_DWithin` uses the index; `<->` orders results by distance.

```sql
CREATE TABLE places (
  id   BIGINT PRIMARY KEY,
  name TEXT,
  geog GEOGRAPHY(POINT, 4326) NOT NULL
);
CREATE INDEX places_geog_idx ON places USING GIST (geog);

SELECT id, name
FROM places
WHERE ST_DWithin(geog, ST_MakePoint(-0.0015, 51.4779)::geography, 500)  -- meters
ORDER BY geog <-> ST_MakePoint(-0.0015, 51.4779)::geography
LIMIT 20;
```

`ST_MakePoint` takes longitude first. Swapping the order is the most common PostGIS bug, and it fails silently with valid-looking results.

### Redis

Geo commands store a 52-bit geohash as a sorted-set score. `GEOSEARCH` does the cell-plus-8-neighbors lookup and distance filter described above.

```text
GEOADD drivers -0.0015 51.4779 driver:1 0.0015 51.4779 driver:2
GEOSEARCH drivers FROMLONLAT -0.0015 51.4779 BYRADIUS 500 m ASC COUNT 20 WITHDIST
```

This fits frequently updated positions, such as drivers. Redis takes longitude first too.

### H3 and S2

H3 (Uber) and S2 (Google) are hierarchical cell systems built for the same job. H3's hexagons have six equidistant neighbors, which helps with aggregation and heatmaps. S2 cells avoid the worst distortion near the poles.

## Takeaways

- Two nearby points can have completely different geohashes. A shared prefix only means a shared cell.
- Always search the cell plus its 8 neighbors, then filter by haversine distance.
- Derive precision from the radius and the query latitude.
- Build the index once and update it incrementally. Index build cost dominates small workloads.
- Check argument order: PostGIS and Redis both take longitude first.
- Use PostGIS for queries that sit next to relational data, and Redis `GEOSEARCH` for fast-moving points.
