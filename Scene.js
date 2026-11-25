.pragma library
.import "Astro.js" as Astro
.import "VideoData.js" as VD

// Layout of the solar system on screen, in "video pixels" (a 3440x1440 design
// frame, cropped and scaled to fit any screen). Two scales:
//   video: distances compressed as sqrt(AU), sizes enlarged (the video's look)
//   real:  true distances and true sizes, one scale for everything
// Directions are always the real ones for the date.

var W = 3440, H = 1440
var CX = W / 2, CY = H / 2 + 10
var TILT = 0.40, CA = Math.sqrt(1 - TILT * TILT)
var K = 1580 / Math.sqrt(30.07)       // video: px per sqrt(AU)
var KLIN = 1580 / 30.07                // real: px per AU (Neptune at the same place)
var AU_KM = 149597870.7
var SUN_R_VIDEO = 46

function hex(h) {
  return [parseInt(h.substr(0, 2), 16) / 255, parseInt(h.substr(2, 2), 16) / 255, parseInt(h.substr(4, 2), 16) / 255]
}

// key, video texture, video radius px, atmosphere colour, focus extent (video,
// real), and the photographic map used when seen up close
var PLANETS = [
  { key: "mercury", file: "merkur", r: 4.2, extent: [2.2, 1.4], photo: "mercury.jpg" },
  { key: "venus", file: "venus", r: 6.8, atmos: "ffe2a0", extent: [2.2, 1.4], photo: "venus_atmosphere.jpg" },
  { key: "earth", file: "jorden", r: 7.2, atmos: "6fa8ff", extent: [3.0, 1.4], photo: "earth_daymap.jpg" },
  { key: "mars", file: "mars", r: 5.2, extent: [3.0, 1.4], photo: "mars.jpg" },
  { key: "jupiter", file: "jupiter", r: 19.0, extent: [4.0, 1.4], photo: "jupiter.jpg" },
  { key: "saturn", file: "saturn", r: 15.5, rings: true, extent: [5.0, 2.6], photo: "saturn.jpg" },
  { key: "uranus", file: "uranus", r: 10.5, atmos: "bff4ff", extent: [4.8, 1.4], photo: "uranus.jpg" },
  { key: "neptune", file: "neptun", r: 10.0, atmos: "6f9cff", extent: [3.4, 1.4], photo: "neptune.jpg" }
]

// Moons: video distance (planet radii) and radius (px) as in the video; real
// distance and radius in km; period in days.
var MOONS = [
  { key: "moon", file: "maanen", photo: "moon.jpg", parent: "earth", vd: 2.6, vr: 2.0, km: 384400, rkm: 1737.4, P: 27.321661 },
  { key: "phobos", file: "phobos", parent: "mars", vd: 1.9, vr: 1.0, km: 9376, rkm: 11.1, P: 0.31891 },
  { key: "deimos", file: "deimos", parent: "mars", vd: 2.7, vr: 0.9, km: 23463, rkm: 6.2, P: 1.26244 },
  { key: "io", file: "io", parent: "jupiter", vd: 1.75, vr: 2.2, km: 421700, rkm: 1821.6, P: 1.769138 },
  { key: "europa", file: "europa", parent: "jupiter", vd: 2.25, vr: 2.0, km: 671034, rkm: 1560.8, P: 3.551181 },
  { key: "ganymede", file: "ganymedes", parent: "jupiter", vd: 2.85, vr: 2.8, km: 1070412, rkm: 2634.1, P: 7.154553 },
  { key: "callisto", file: "callisto", parent: "jupiter", vd: 3.6, vr: 2.6, km: 1882709, rkm: 2410.3, P: 16.689017 },
  { key: "enceladus", file: "enceladus", parent: "saturn", vd: 2.55, vr: 1.3, km: 237948, rkm: 252.1, P: 1.370218 },
  { key: "tethys", file: "tethys", parent: "saturn", vd: 2.85, vr: 1.6, km: 294619, rkm: 531.1, P: 1.887802 },
  { key: "dione", file: "dione", parent: "saturn", vd: 3.2, vr: 1.6, km: 377396, rkm: 561.4, P: 2.736915 },
  { key: "rhea", file: "rhea", parent: "saturn", vd: 3.7, vr: 1.9, km: 527108, rkm: 763.8, P: 4.518212 },
  { key: "titan", file: "titan", parent: "saturn", vd: 4.6, vr: 3.0, km: 1221870, rkm: 2574.7, P: 15.945421 },
  { key: "iapetus", file: "iapetus", parent: "saturn", vd: 6.0, vr: 1.7, km: 3560820, rkm: 734.5, P: 79.3215 },
  { key: "miranda", file: "miranda", parent: "uranus", vd: 2.0, vr: 1.0, km: 129390, rkm: 235.8, P: 1.413479 },
  { key: "ariel", file: "ariel", parent: "uranus", vd: 2.5, vr: 1.5, km: 191020, rkm: 578.9, P: 2.520379 },
  { key: "umbriel", file: "umbriel", parent: "uranus", vd: 3.0, vr: 1.5, km: 266000, rkm: 584.7, P: 4.144177 },
  { key: "titania", file: "titania", parent: "uranus", vd: 3.7, vr: 1.9, km: 435910, rkm: 788.9, P: 8.705872 },
  { key: "oberon", file: "oberon", parent: "uranus", vd: 4.4, vr: 1.9, km: 583520, rkm: 761.4, P: 13.463239 },
  { key: "triton", file: "triton", parent: "neptune", vd: 3.0, vr: 2.2, km: 354759, rkm: 1353.4, P: 5.876854 }
]

// Every drawn body, planets first; index = position in this list.
var BODIES = (function() {
  var out = []
  for (var i = 0; i < PLANETS.length; i++) {
    var p = PLANETS[i]
    out.push({ key: p.key, file: p.file, moon: false, rings: !!p.rings,
               atmos: p.atmos ? hex(p.atmos) : null, photo: p.photo, earth: p.key === "earth" })
  }
  for (var j = 0; j < MOONS.length; j++)
    out.push({ key: MOONS[j].key, file: MOONS[j].file, moon: true, rings: false, atmos: null,
               photo: MOONS[j].photo || "", earth: false })
  return out
})()

function planetInfo(key) {
  for (var i = 0; i < PLANETS.length; i++) if (PLANETS[i].key === key) return PLANETS[i]
  return null
}
function moonInfo(key) {
  for (var i = 0; i < MOONS.length; i++) if (MOONS[i].key === key) return MOONS[i]
  return null
}

// Orbit planes of the moons in the video's world frame (X right, Y away, Z up).
function plane(n) {
  var l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2])
  n = [n[0] / l, n[1] / l, n[2] / l]
  var e1 = Math.abs(n[2]) < 0.99 ? [-n[1], n[0], 0] : [1, 0, 0]   // cross([0,0,1], n)
  l = Math.sqrt(e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2])
  e1 = [e1[0] / l, e1[1] / l, e1[2] / l]
  var e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]]
  return [e1, e2]
}
// Real moon orbits, fitted to JPL Horizons positions (ecliptic J2000, relative
// to the planet) for 2025-11-25 to 2027-11-25 by tools/fit_moons.py: the mean
// orbit plane normal n, the angle ph0 (rad) in that plane at day d0, and the
// mean motion in rad/day. Within about 3 degrees of the true positions over
// those years (Titan and Iapetus, which are slightly elliptical, the most),
// slowly drifting further outside them.
var MOON_ORBITS = {
  phobos: { n: [0.443965, -0.055117, 0.894348], d0: 9824.5, ph0: 6.117938, rate: 19.7020610613 },
  deimos: { n: [0.404034, -0.059545, 0.912804], d0: 9824.5, ph0: 4.745838, rate: 4.9770132757 },
  io: { n: [-0.014396, -0.03613, 0.999243], d0: 9824.4, ph0: 1.660066, rate: 3.5515521311 },
  europa: { n: [-0.019962, -0.029996, 0.999351], d0: 9824.5, ph0: 0.850248, rate: 1.7693223817 },
  ganymede: { n: [-0.014627, -0.038192, 0.999163], d0: 9824.3, ph0: 4.804722, rate: 0.8782082066 },
  callisto: { n: [-0.013436, -0.031297, 0.99942], d0: 9824.1, ph0: 5.507652, rate: 0.3764861968 },
  enceladus: { n: [0.085447, 0.462426, 0.882531], d0: 9824.5, ph0: 2.644633, rate: 4.5855362118 },
  tethys: { n: [0.072305, 0.467903, 0.880817], d0: 9824.4, ph0: 3.517575, rate: 3.3283057873 },
  dione: { n: [0.085201, 0.462104, 0.882723], d0: 9824.5, ph0: 0.032744, rate: 2.2957176174 },
  rhea: { n: [0.082635, 0.466477, 0.880665], d0: 9824.4, ph0: 4.864602, rate: 1.3908536412 },
  titan: { n: [0.088068, 0.456495, 0.885357], d0: 9823.8, ph0: 6.277815, rate: 0.3940450136 },
  iapetus: { n: [0.192092, 0.219827, 0.956439], d0: 9824.4, ph0: 0.368581, rate: 0.0791944104 },
  miranda: { n: [0.285152, 0.948806, -0.135851], d0: 9824.5, ph0: 2.997013, rate: 4.4452328180 },
  ariel: { n: [0.211679, 0.968067, -0.134307], d0: 9824.4, ph0: 3.361534, rate: 2.4929496935 },
  umbriel: { n: [0.210673, 0.968295, -0.134244], d0: 9824.3, ph0: 1.956223, rate: 1.5161487262 },
  titania: { n: [0.212025, 0.967887, -0.135058], d0: 9824.1, ph0: 1.342765, rate: 0.7217184006 },
  oberon: { n: [0.210871, 0.967789, -0.137545], d0: 9824.2, ph0: 4.215373, rate: 0.4666920917 },
  triton: { n: [-0.528082, 0.568309, -0.630995], d0: 9824.3, ph0: 5.758951, rate: 1.0691429059 }
}
var PLANES = {}
for (var mk in MOON_ORBITS) PLANES[mk] = plane(MOON_ORBITS[mk].n)

// ---- body orientation ------------------------------------------------------
// IAU pole (right ascension, declination) and prime meridian W, turned into
// three screen directions: N (north pole), M (where longitude 0 faces) and
// E (longitude 90 east). Screen: x right, y down, z towards the viewer.
var DEG = Math.PI / 180
var OBLIQUITY = 23.4392911 * DEG
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]] }
function unit(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); return [a[0] / l, a[1] / l, a[2] / l] }
function eqToEcl(v) {
  var c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY)
  return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c]
}
// Video world (X right, Y away, Z ecliptic north) -> screen
function worldToScreen(v) { return [v[0], -TILT * v[1] - CA * v[2], -CA * v[1] + TILT * v[2]] }

// The full orientation on screen for day d
function orientation(key, d) {
  var R = Astro.ROTATION[key], T = d / 36525
  var a = (R[0] + R[1] * T) * DEG, dec = (R[2] + R[3] * T) * DEG
  var N = [Math.cos(dec) * Math.cos(a), Math.cos(dec) * Math.sin(a), Math.sin(dec)]
  var Q = unit(cross([0, 0, 1], N))                     // node on the Earth's equator
  var W = (R[4] + R[5] * d) * DEG
  var NQ = cross(N, Q)
  var M = [Q[0] * Math.cos(W) + NQ[0] * Math.sin(W), Q[1] * Math.cos(W) + NQ[1] * Math.sin(W),
           Q[2] * Math.cos(W) + NQ[2] * Math.sin(W)]
  var E = cross(N, M)
  return { n: worldToScreen(eqToEcl(N)), m: worldToScreen(eqToEcl(M)), e: worldToScreen(eqToEcl(E)) }
}

// Heliocentric ecliptic point (AU) of a body whose orbit has semi-major axis
// a (AU) -> video pixels.
// Real scale: one linear scale for everything.
// Video scale: distances are compressed as sqrt(AU), but per orbit rather than
// per point: the whole orbit is scaled by K / sqrt(a). Each orbit then stays a
// true Kepler ellipse with the Sun at its focus (its real shape and
// eccentricity), sits at the video's compressed size, and the planet stays on
// it. (Compressing every point by its own distance bent the ellipses.)
function project(real, p, a) {
  if (real)
    return [CX + KLIN * p[0], CY - KLIN * (p[1] * TILT + p[2] * CA)]
  var s = K / Math.sqrt(a)
  return [CX + s * p[0], CY - s * TILT * p[1]]
}

function semiMajor(key, d) { return Astro.elementsAt(key, d).a }

function sunRadius(real) { return real ? KLIN * Astro.RADIUS_KM.sun / AU_KM : SUN_R_VIDEO }

// Direction to the Sun in screen space (x right, y down, z towards the viewer)
function lightVec(theta) {
  return [-Math.cos(theta), Math.sin(theta) * TILT, Math.sin(theta) * CA]
}

// All bodies for day d. Returns one entry per BODIES item:
// { x, y, r, depth, light: [x,y,z], orient: { n, m, e } } in video pixels.
// orient is the real IAU orientation (pole, prime meridian) on screen, so the
// photo globes tilt and turn as the real bodies do: Earth shows the real
// daylit side, the Moon its near side, Uranus lies on its side.
function layout(real, d) {
  var out = [], planets = {}
  for (var i = 0; i < PLANETS.length; i++) {
    var pl = PLANETS[i]
    var p = Astro.planetEcliptic(pl.key, d)
    var th = Math.atan2(p[1], p[0])
    var depth = Math.sin(th)                         // > 0 = behind the Sun
    var scale = real ? 1 : 1 - 0.05 * depth
    var xy = project(real, p, semiMajor(pl.key, d))
    var r = real ? KLIN * Astro.RADIUS_KM[pl.key] / AU_KM : pl.r * scale
    var L = lightVec(th)
    var e = { x: xy[0], y: xy[1], r: r, depth: depth, light: L, scale: scale,
              orient: orientation(pl.key, d) }
    planets[pl.key] = e
    out.push(e)
  }
  var moonNow = Astro.moonGeocentric(d)
  for (var j = 0; j < MOONS.length; j++) {
    var m = MOONS[j], par = planets[m.parent]
    var dist = real ? m.km / Astro.RADIUS_KM[m.parent] : m.vd   // in planet radii
    var v
    if (m.key === "moon") {
      v = moonNow.dir                                 // the real direction
      if (real) dist = moonNow.km / Astro.RADIUS_KM.earth
    } else {
      var orb = MOON_ORBITS[m.key]
      var ph = orb.ph0 + orb.rate * (d - orb.d0)
      var pl2 = PLANES[m.key]
      v = [pl2[0][0] * Math.cos(ph) + pl2[1][0] * Math.sin(ph),
           pl2[0][1] * Math.cos(ph) + pl2[1][1] * Math.sin(ph),
           pl2[0][2] * Math.cos(ph) + pl2[1][2] * Math.sin(ph)]
    }
    var k = dist * par.r
    var px = v[0] * k, py = v[1] * k, pz = v[2] * k
    var mdepth = py * CA - pz * TILT
    out.push({ x: par.x + px, y: par.y - (py * TILT + pz * CA),
               r: real ? KLIN * m.rkm / AU_KM : m.vr * par.scale,
               depth: par.depth + 1e-4 * mdepth, light: par.light,
               orient: m.key === "moon" ? orientation("moon", d) : null })
  }
  return out
}

// Orbits as flat [x0, y0, x1, y1, ...] lists in video pixels
function orbits(real, d) {
  var out = []
  for (var i = 0; i < PLANETS.length; i++) {
    var pts = Astro.orbitPath(PLANETS[i].key, d, 360), line = [], a = semiMajor(PLANETS[i].key, d)
    for (var j = 0; j < pts.length; j++) {
      var q = project(real, pts[j], a)
      line.push(q[0], q[1])
    }
    out.push(line)
  }
  return out
}

// One orbit as an SVG path in screen pixels for the view (ox, oy, k):
// screen = o + p * k. Done in double precision, so deep zooms stay exact.
function orbitSvg(line, ox, oy, k) {
  if (!line || !line.length) return ""
  var s = ""
  for (var j = 0; j < line.length; j += 2)
    s += (j ? " L " : "M ") + (ox + line[j] * k).toFixed(2) + " " + (oy + line[j + 1] * k).toFixed(2)
  return s
}

// The video's asteroid belt, moving with Kepler's third law
function asteroids(real, d) {
  var A = VD.DATA.asteroids, n = A.a.length, xs = new Array(n), ys = new Array(n)
  for (var i = 0; i < n; i++) {
    var a = A.a[i]
    var th = A.ph[i] + 2 * Math.PI * d / (365.25 * Math.pow(a, 1.5))
    var R = real ? KLIN * a + A.dr[i] * 0.2 : K * Math.sqrt(a) + A.dr[i]
    xs[i] = CX + R * Math.cos(th)
    ys[i] = CY - R * TILT * Math.sin(th)
  }
  return { x: xs, y: ys, b: A.b }
}

function beltRadius(real) { return real ? KLIN * 3.3 + 4 : K * Math.sqrt(3.3) + 16 }

// ---- blends between the two scales (u: 0 = video, 1 = real) ----------------
// Positions slide linearly; sizes change evenly in log scale, so the flight
// from enlarged to true sizes looks like a steady shrink rather than a snap.
function lerp(a, b, u) { return a + (b - a) * u }
function lerpLog(a, b, u) { return Math.exp(lerp(Math.log(Math.max(a, 1e-9)), Math.log(Math.max(b, 1e-9)), u)) }

function layoutMix(u, d) {
  if (u <= 0) return layout(false, d)
  if (u >= 1) return layout(true, d)
  var a = layout(false, d), b = layout(true, d), out = []
  for (var i = 0; i < a.length; i++)
    out.push({ x: lerp(a[i].x, b[i].x, u), y: lerp(a[i].y, b[i].y, u), r: lerpLog(a[i].r, b[i].r, u),
               depth: a[i].depth, light: a[i].light, scale: a[i].scale, orient: a[i].orient })
  return out
}

function orbitsMix(u, d) {
  if (u <= 0) return orbits(false, d)
  if (u >= 1) return orbits(true, d)
  var out = []
  for (var i = 0; i < PLANETS.length; i++) {
    var pts = Astro.orbitPath(PLANETS[i].key, d, 360), line = [], a = semiMajor(PLANETS[i].key, d)
    for (var j = 0; j < pts.length; j++) {
      var p = project(false, pts[j], a), q = project(true, pts[j], a)
      line.push(lerp(p[0], q[0], u), lerp(p[1], q[1], u))
    }
    out.push(line)
  }
  return out
}

function asteroidsMix(u, d) {
  if (u <= 0) return asteroids(false, d)
  if (u >= 1) return asteroids(true, d)
  var a = asteroids(false, d), b = asteroids(true, d), n = a.x.length
  var xs = new Array(n), ys = new Array(n)
  for (var i = 0; i < n; i++) { xs[i] = lerp(a.x[i], b.x[i], u); ys[i] = lerp(a.y[i], b.y[i], u) }
  return { x: xs, y: ys, b: a.b }
}

function sunRadiusMix(u) { return lerpLog(sunRadius(false), sunRadius(true), u) }
function beltRadiusMix(u) { return lerp(beltRadius(false), beltRadius(true), u) }
function extentMix(p, u) { return lerp(p.extent[0], p.extent[1], u) }
