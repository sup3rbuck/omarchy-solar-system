# Run: python3 tools/fit_moons.py out.json  (then paste into MOON_ORBITS in Scene.js)
# Fits each moon's mean orbit (plane normal, phase at epoch, mean motion) from
# JPL Horizons state vectors, ecliptic J2000, relative to its planet.
import json, math, sys, time, urllib.parse, urllib.request
MOONS = {"phobos": (401, 499, 0.3189), "deimos": (402, 499, 1.2624), "io": (501, 599, 1.769),
  "europa": (502, 599, 3.551), "ganymede": (503, 599, 7.155), "callisto": (504, 599, 16.69),
  "enceladus": (602, 699, 1.370), "tethys": (603, 699, 1.888), "dione": (604, 699, 2.737),
  "rhea": (605, 699, 4.518), "titan": (606, 699, 15.95), "iapetus": (608, 699, 79.33),
  "miranda": (705, 799, 1.413), "ariel": (701, 799, 2.520), "umbriel": (702, 799, 4.144),
  "titania": (703, 799, 8.706), "oberon": (704, 799, 13.46), "triton": (801, 899, 5.877)}
START, STOP = "2025-11-25", "2027-11-25"
J2000_JD = 2451545.0
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def dot(a, b): return sum(x*y for x, y in zip(a, b))
def unit(a): l = math.sqrt(dot(a, a)); return [x/l for x in a]
out = {}
for key, (sid, center, P) in MOONS.items():
    step = max(1, int(P * 24 * 60 / 10))   # ten samples per orbit, in minutes
    q = {"format": "json", "COMMAND": f"'{sid}'", "EPHEM_TYPE": "VECTORS", "CENTER": f"'500@{center}'",
         "START_TIME": START, "STOP_TIME": STOP, "STEP_SIZE": f"'{step} min'", "REF_PLANE": "ECLIPTIC",
         "REF_SYSTEM": "ICRF", "VEC_TABLE": "2", "CSV_FORMAT": "YES", "OUT_UNITS": "KM-D", "OBJ_DATA": "NO"}
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q)
    res = json.load(urllib.request.urlopen(url, timeout=120))["result"]
    body = res.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    rows = []
    for line in body:
        f = [x.strip() for x in line.split(",")]
        jd = float(f[0]); r = [float(f[2]), float(f[3]), float(f[4])]; v = [float(f[5]), float(f[6]), float(f[7])]
        rows.append((jd, r, v))
    h = [0.0, 0.0, 0.0]
    for _, r, v in rows:
        c = unit(cross(r, v)); h = [h[i] + c[i] for i in range(3)]
    n = unit(h)
    e1 = unit([-n[1], n[0], 0.0]) if abs(n[2]) < 0.99 else [1.0, 0.0, 0.0]
    e2 = cross(n, e1)
    ts, ph, prev, off = [], [], None, 0.0
    for jd, r, _ in rows:
        a = math.atan2(dot(r, e2), dot(r, e1))
        if prev is not None:
            while a + off - prev > math.pi: off -= 2*math.pi
            while a + off - prev < -math.pi: off += 2*math.pi
        prev = a + off; ts.append(jd - J2000_JD); ph.append(prev)
    m = len(ts); mt = sum(ts)/m; mp = sum(ph)/m
    rate = sum((t-mt)*(p-mp) for t, p in zip(ts, ph)) / sum((t-mt)**2 for t in ts)
    d0 = round(mt, 1); ph0 = (mp + rate*(d0-mt)) % (2*math.pi)
    resid = max(abs(p - (mp + rate*(t-mt))) for t, p in zip(ts, ph)) * 180/math.pi
    out[key] = {"n": [round(x, 6) for x in n], "d0": d0, "ph0": round(ph0, 6),
                "rate": rate, "P": round(2*math.pi/rate, 7), "maxResidualDeg": round(resid, 2)}
    print(key, len(rows), "P", out[key]["P"], "resid", out[key]["maxResidualDeg"], file=sys.stderr)
    time.sleep(1)
json.dump(out, open(sys.argv[1], "w"), indent=1)
