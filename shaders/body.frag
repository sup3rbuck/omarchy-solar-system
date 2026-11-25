#version 440
// One planet or moon, drawn exactly like solsystem.py's draw_planet():
// flat-mapped texture, Lambert-ish shading towards the Sun, atmosphere rim,
// and for Saturn the ring, in its real equator plane, split into a back half
// and a front half.
// Seen up close (detail > 0) it blends into a photographic map wrapped on a
// turning globe, with Earth's clouds and city lights.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float sz;       // item size in px
    float r;        // planet radius in px
    float rings;    // 1 = Saturn's rings
    vec4 light;     // direction to the Sun (x right, y down, z to viewer)
    vec4 atmos;     // rim colour, a = 1 when present
    vec4 pole;      // xyz: the body's north pole on screen (x right, y down, z to viewer)
    vec4 meridian;  // xyz: where longitude 0 faces
    vec4 east;      // xyz: where longitude 90 east faces
    float detail;   // 0 = the video's flat texture, 1 = photo globe
    float earth;    // 1 = add clouds and city lights
};
layout(binding = 1) uniform sampler2D tex;
layout(binding = 2) uniform sampler2D ringTex;
layout(binding = 3) uniform sampler2D photo;
layout(binding = 4) uniform sampler2D cloudTex;
layout(binding = 5) uniform sampler2D nightTex;

const float PI = 3.14159265358979;

// Sample an equirectangular map without the seam where longitude wraps: the
// mip level comes from whichever of u or u+0.5 is continuous at this pixel, so
// the jump from 1 back to 0 doesn't read as a huge derivative.
vec4 sphereTex(sampler2D t, vec2 tc) {
    float u2 = fract(tc.x + 0.5);
    float dxa = dFdx(tc.x), dxb = dFdx(u2);
    float dya = dFdy(tc.x), dyb = dFdy(u2);
    vec2 gx = vec2(abs(dxa) <= abs(dxb) ? dxa : dxb, dFdx(tc.y));
    vec2 gy = vec2(abs(dya) <= abs(dyb) ? dya : dyb, dFdy(tc.y));
    return textureGrad(t, tc, gx, gy);
}
// Longitude and latitude of a point on the globe, from the body's real
// orientation (IAU pole and prime meridian), so Uranus lies on its side.
vec2 lonLat(vec3 p) {
    return vec2(atan(dot(p, east.xyz), dot(p, meridian.xyz)), asin(clamp(dot(p, pole.xyz), -1.0, 1.0)));
}

void main()
{
    vec2 d = qt_TexCoord0 * sz - vec2(sz * 0.5);
    float dist = length(d);
    float alpha = clamp(r + 0.5 - dist, 0.0, 1.0);

    vec2 uv = d / r;
    float q = dot(uv, uv);
    if (q > 1.0) uv /= sqrt(q);
    float w = sqrt(clamp(1.0 - dot(uv, uv), 0.0, 1.0));
    float ndl = uv.x * light.x + uv.y * light.y + w * light.z;
    float shade = pow(clamp(ndl, 0.0, 1.0), 0.85);
    vec3 base = texture(tex, (uv + 1.0) * 0.5).rgb;
    float lights = 0.0;
    if (detail > 0.0) {
        vec2 ll = lonLat(vec3(uv, w));
        vec2 tc = vec2(fract(ll.x / (2.0 * PI) + 0.5), 0.5 - ll.y / PI);
        vec3 ph = sphereTex(photo, tc).rgb;
        if (earth > 0.5) {
            ph = mix(ph, vec3(1.0), sphereTex(cloudTex, tc).r * 0.9);
            lights = sphereTex(nightTex, tc).r * (1.0 - smoothstep(-0.05, 0.12, ndl));
        }
        base = mix(base, ph, detail);
    }
    vec3 col = base * (0.02 + 1.08 * shade) + vec3(1.0, 0.8, 0.5) * lights * 0.9 * detail;
    if (atmos.a > 0.5) {
        float rim = pow(1.0 - w, 2.5) * clamp(ndl + 0.25, 0.0, 1.0);
        col += rim * atmos.rgb * 0.55;
    }

    vec4 acc = vec4(0.0);
    if (rings > 0.5) {
        // 4x4 supersampling, so the thin rings stay smooth
        float back = 0.0, front = 0.0;
        vec3 rc = vec3(0.0);
        for (int j = 0; j < 4; j++) {
            for (int i = 0; i < 4; i++) {
                vec2 o = (vec2(float(i), float(j)) + 0.5) / 4.0 - 0.5;
                vec2 dd = d + o;
                // Where this pixel's line of sight meets the equator plane
                // (the ring plane), in planet radii; z > 0 is nearer the viewer.
                vec3 n = pole.xyz;
                float nz = n.z >= 0.0 ? max(n.z, 0.02) : min(n.z, -0.02);
                float zr = -(n.x * dd.x + n.y * dd.y) / nz;
                float rho = length(vec3(dd, zr)) / r;
                if (rho >= 1.2 && rho <= 2.3) {
                    float u = (rho - 1.2) / 1.1;
                    vec3 c = texture(ringTex, vec2(u, 0.25)).rgb;
                    float pa = texture(ringTex, vec2(u, 0.75)).r;
                    rc += c * pa;
                    if (zr < 0.0) back += pa; else front += pa;
                }
            }
        }
        float tot = back + front;
        rc = rc / max(tot, 1e-6) * 0.95;
        back /= 16.0;
        front /= 16.0;
        acc = vec4(rc * back, back);
        acc = vec4(col * alpha, alpha) + acc * (1.0 - alpha);
        acc = vec4(rc * front, front) + acc * (1.0 - front);
    } else {
        acc = vec4(col * alpha, alpha);
    }
    fragColor = acc * qt_Opacity;
}
