#version 440
// The Sun, ported from solsystem.py: draw_sun() (rotating surface with
// granulation and sunspots, corona with slowly changing rays) plus the wide
// bloom the video baked into its background. Output is premultiplied, so the
// glow adds light and the disc covers what is behind it.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 size;      // item size in px
    vec2 center;    // Sun centre in item px
    float rsun;        // Sun radius in px
    float ks;       // px per video px for the corona
    float kb;       // px per video px for the wide glow (capped when zoomed in)
    float t;        // corona animation, 0..1 over two hours
    vec4 pole;      // the Sun's north pole on screen (x right, y down, z to viewer)
    vec4 meridian;  // where its longitude 0 faces
    vec4 east;      // where longitude 90 east faces
    float detail;   // 0 = the video's surface, 1 = the photo of the Sun (close up)
};
layout(binding = 1) uniform sampler2D surf;
layout(binding = 2) uniform sampler2D rays;
layout(binding = 3) uniform sampler2D photo;

const float PI = 3.14159265358979;

// Equirectangular lookup without the seam where longitude wraps (see body.frag).
vec4 sphereTex(sampler2D t, vec2 tc) {
    float u2 = fract(tc.x + 0.5);
    float dxa = dFdx(tc.x), dxb = dFdx(u2);
    float dya = dFdy(tc.x), dyb = dFdy(u2);
    vec2 gx = vec2(abs(dxa) <= abs(dxb) ? dxa : dxb, dFdx(tc.y));
    vec2 gy = vec2(abs(dya) <= abs(dyb) ? dya : dyb, dFdy(tc.y));
    return textureGrad(t, tc, gx, gy);
}

void main()
{
    vec2 p = qt_TexCoord0 * size - center;
    float sd = length(p);

    // disc
    float su = p.x / rsun, sv = p.y / rsun;
    float sw = sqrt(clamp(1.0 - su * su - sv * sv, 0.0, 1.0));
    float salpha = clamp((rsun + 1.0 - sd) / 2.5, 0.0, 1.0);
    vec3 disc = vec3(0.0);
    if (salpha > 0.0) {
        // Real orientation: the Sun's pole leans 7 degrees and towards the viewer.
        vec3 sp = vec3(su, sv, sw);
        float slat = asin(clamp(dot(sp, pole.xyz), -1.0, 1.0));
        float lon = mod(atan(dot(sp, east.xyz), dot(sp, meridian.xyz)), 2.0 * PI);
        float s = sphereTex(surf, vec2(lon / (2.0 * PI), slat / PI + 0.5)).r * 1.25;
        vec3 scol = mix(vec3(0.957, 0.478, 0.110), vec3(1.0, 0.831, 0.494), pow(sw, 0.3));
        float limb = 1.0 - 0.18 * (1.0 - sw);
        disc = scol * limb * s * 1.12;
        // Close up: the real photo (Solar System Scope, from NASA SDO imagery)
        // on the same turning globe, with real limb darkening.
        if (detail > 0.0) {
            vec2 tc = vec2(lon / (2.0 * PI), 0.5 - slat / PI);
            vec3 ph = sphereTex(photo, tc).rgb;
            float plimb = 0.4 + 0.6 * pow(sw, 0.5);
            disc = mix(disc, ph * plimb * 1.15, detail);
        }
    }

    // corona
    float se = max(sd - rsun, 0.0) / ks;
    float ang = atan(p.y, p.x) + PI;
    float ry = 1.0;
    for (int i = 0; i < 40; i++) {
        float u = (float(i) + 0.5) / 40.0;
        vec3 a = floor(texture(rays, vec2(u, 0.25)).rgb * 255.0 + 0.5);
        vec3 b = floor(texture(rays, vec2(u, 0.75)).rgb * 255.0 + 0.5);
        float amp = a.g / 510.0;
        float ph = (a.b * 256.0 + b.g) / 65535.0 * 2.0 * PI;
        float m = b.r - 3.0;
        ry += 0.28 * amp * sin(a.r * ang + ph + 2.0 * PI * m * t);
    }
    ry = max(ry, 0.4);
    float cor = 0.35 * exp(-se / 6.0) + 0.5 * exp(-se / (10.0 * ry)) + 0.16 * exp(-se / (26.0 * ry));
    vec3 glow = cor * vec3(1.0, 0.812, 0.541);

    // wide bloom (part of the video's background)
    float sb = max(sd - rsun, 0.0) / kb;
    float bloom = 0.11 * exp(-sb / 55.0) + 0.05 * exp(-sb / 200.0) + 0.025 * exp(-sb / 700.0);
    glow += bloom * vec3(1.0, 0.745, 0.471);

    fragColor = vec4(glow * (1.0 - salpha) + disc * salpha, salpha) * qt_Opacity;
}
