"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Silk Background — WebGL shader-based flowing silk wave animation.
 * Adapted from the Framer Silk Background by Karim Saif.
 * Uses raw WebGL (no Three.js dependency) for a lightweight implementation.
 *
 * RepairOX-themed with brand blue silk on a light/dark background.
 * Respects prefers-reduced-motion by pausing animation.
 */

const VERTEX_SHADER = `
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec3  uColor;
uniform vec3  uBackground;
uniform float uIntensity;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;
uniform float uSeed;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2  r = (G * sin(G * (texCoord + vec2(uSeed))));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2  rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd         = noise(gl_FragCoord.xy);
  vec2  uv          = rotateUvs(vUv * uScale, uRotation);
  vec2  tex         = uv * uScale;

  tex.y += 0.03 * sin(8.0 * tex.x - uTime);

  float rawPattern = 0.6 +
                     0.4 * sin(5.0 * (tex.x + tex.y +
                                      cos(3.0 * tex.x + 5.0 * tex.y) +
                                      0.02 * uTime) +
                               sin(20.0 * (tex.x + tex.y - 0.1 * uTime)));

  float pattern = smoothstep(0.1, 0.9, rawPattern);
  vec3 silkColor = (uColor * uIntensity) * pattern;
  vec3 finalColor = mix(uBackground, silkColor, clamp(pattern, 0.0, 1.0));

  gl_FragColor = vec4(finalColor, 1.0);
}
`;

interface SilkBackgroundProps {
  /** Silk wave color — default RepairOX brand blue */
  color?: string;
  /** Base background color */
  backgroundColor?: string;
  /** Overall opacity of the canvas */
  opacity?: number;
  /** Silk highlight intensity (0-3) */
  intensity?: number;
  /** Animation speed (0-20) */
  speed?: number;
  /** Wave rotation in degrees */
  rotation?: number;
  /** Pattern scale */
  scale?: number;
  /** Film grain amount */
  noiseIntensity?: number;
  /** Pattern seed variation */
  seed?: number;
  /** Container className */
  className?: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}

export function SilkBackground({
  color = "#4361EE",
  backgroundColor = "#EEF1FD",
  opacity = 0.5,
  intensity = 0.8,
  speed = 3,
  rotation = 0,
  scale = 1,
  noiseIntensity = 1.2,
  seed = 0,
  className,
}: SilkBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check prefers-reduced-motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = motionQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches;
    };
    motionQuery.addEventListener("change", handleMotionChange);

    // Get WebGL context
    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: true,
      powerPreference: "low-power",
    });

    if (!gl) {
      // Fallback: just show the background color
      canvas.style.background = backgroundColor;
      return;
    }

    // Compile shaders
    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    gl.useProgram(program);

    // Fullscreen quad
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Uniform locations
    const uTime = gl.getUniformLocation(program, "uTime");
    const uColor = gl.getUniformLocation(program, "uColor");
    const uBackground = gl.getUniformLocation(program, "uBackground");
    const uIntensity = gl.getUniformLocation(program, "uIntensity");
    const uScale = gl.getUniformLocation(program, "uScale");
    const uRotation = gl.getUniformLocation(program, "uRotation");
    const uNoiseIntensity = gl.getUniformLocation(program, "uNoiseIntensity");
    const uSeed = gl.getUniformLocation(program, "uSeed");

    // Set static uniforms
    const [cr, cg, cb] = hexToRgb(color);
    const [br, bg2, bb] = hexToRgb(backgroundColor);
    gl.uniform3f(uColor, cr, cg, cb);
    gl.uniform3f(uBackground, br, bg2, bb);
    gl.uniform1f(uIntensity, intensity);
    gl.uniform1f(uScale, scale);
    gl.uniform1f(uRotation, (rotation * Math.PI) / 180);
    gl.uniform1f(uNoiseIntensity, noiseIntensity);
    gl.uniform1f(uSeed, seed);

    // Handle resize
    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio, 1.5); // Cap at 1.5x for perf
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const drawWidth = Math.floor(width * dpr);
      const drawHeight = Math.floor(height * dpr);

      if (canvas.width !== drawWidth || canvas.height !== drawHeight) {
        canvas.width = drawWidth;
        canvas.height = drawHeight;
        gl!.viewport(0, 0, drawWidth, drawHeight);
      }
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    // IntersectionObserver for visibility-based pause
    let isVisible = true;
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    intersectionObserver.observe(canvas);

    // Animation loop
    startTimeRef.current = performance.now();
    let lastTime = startTimeRef.current;

    function render(now: number) {
      if (!isVisible) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      const delta = (now - lastTime) * 0.001; // seconds
      lastTime = now;

      if (!reducedMotionRef.current) {
        const currentTime = gl!.getUniform(program!, uTime!) as number;
        gl!.uniform1f(uTime, currentTime + delta * speed * 0.1);
      }

      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      animationRef.current = requestAnimationFrame(render);
    }

    animationRef.current = requestAnimationFrame(render);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationRef.current);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      motionQuery.removeEventListener("change", handleMotionChange);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(positionBuffer);
    };
  }, [color, backgroundColor, intensity, speed, rotation, scale, noiseIntensity, seed]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full",
        className
      )}
      style={{ opacity }}
    />
  );
}
