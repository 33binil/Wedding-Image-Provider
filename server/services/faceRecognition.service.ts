import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const tf = require('@tensorflow/tfjs-node');
const faceapi = require('@vladmandic/face-api');
const { createCanvas, loadImage, Image, ImageData, Canvas } = require('canvas');
import * as fs from 'fs';
import * as path from 'path';

faceapi.env.monkeyPatch({
  Canvas,
  Image,
  ImageData,
  createCanvasElement: createCanvas,
});

const MODEL_DIR = path.resolve(process.cwd(), 'server/models');
const MODELS_LOADED = new Set<string>();

export interface FaceDetection {
  box: { x: number; y: number; width: number; height: number };
  descriptor: Float32Array;
  confidence: number;
}

export interface ImageFaceAnalysis {
  faceCount: number;
  detections: FaceDetection[];
  imageWidth: number;
  imageHeight: number;
}

let modelsLoading: Promise<void> | null = null;

async function ensureModelsLoaded(): Promise<void> {
  if (MODELS_LOADED.has('all')) return;
  if (modelsLoading) return modelsLoading;

  modelsLoading = (async () => {
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(MODEL_DIR);
    MODELS_LOADED.add('ssd');
    await faceapi.nets.faceLandmark68Net.loadFromDisk(MODEL_DIR);
    MODELS_LOADED.add('landmarks');
    await faceapi.nets.faceRecognitionNet.loadFromDisk(MODEL_DIR);
    MODELS_LOADED.add('recognition');
    MODELS_LOADED.add('all');
  })();

  return modelsLoading;
}

export async function analyzeImageBuffer(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ImageFaceAnalysis> {
  await ensureModelsLoaded();

  const img = await loadImage(imageBuffer);
  const imageWidth = img.width;
  const imageHeight = img.height;

  const detections = await faceapi
    .detectAllFaces(img, new faceapi.SSDMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  const results: FaceDetection[] = detections.map((d: any) => {
    const box = d.box || d._box;
    return {
      box: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      },
      descriptor: d.descriptor as Float32Array,
      confidence: d.score ?? d._score ?? 0,
    };
  });

  return {
    faceCount: results.length,
    detections: results,
    imageWidth,
    imageHeight,
  };
}

export async function analyzeSelfieBuffer(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ImageFaceAnalysis> {
  const result = await analyzeImageBuffer(imageBuffer, mimeType);

  if (result.faceCount === 0) {
    throw new Error('NO_FACE_DETECTED');
  }

  if (result.faceCount > 1) {
    throw new Error('MULTIPLE_FACES_DETECTED');
  }

  return result;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function deserializeDescriptor(arr: number[]): Float32Array {
  return Float32Array.from(arr);
}

export function serializeDescriptor(descriptor: Float32Array): number[] {
  return Array.from(descriptor);
}

export function cleanupTensorFlow(): void {
  try {
    tf.disposeVariables();
  } catch {
    // ignore
  }
}
