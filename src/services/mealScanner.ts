import type {
  DetectedFood,
  MealScanConfidence,
  MealScanQuestion,
  MealScanResult
} from '../types';

const MAX_DIMENSION = 1600;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const JPEG_QUALITY = 0.84;
const MEAL_SCANNER_ENDPOINT = import.meta.env.VITE_MEAL_SCANNER_API_URL?.trim() ?? '';

export type MealScannerErrorCode =
  | 'offline'
  | 'unsupported_image'
  | 'image_too_large'
  | 'timeout'
  | 'backend_unavailable'
  | 'invalid_response'
  | 'no_food'
  | 'rate_limited'
  | 'server_error'
  | 'request_failed';

export class MealScannerError extends Error {
  code: MealScannerErrorCode;

  constructor(code: MealScannerErrorCode, message: string) {
    super(message);
    this.name = 'MealScannerError';
    this.code = code;
  }
}

const MOCK_RESULT: MealScanResult = {
  foods: [
    {
      id: 'food-1',
      name: 'Chicken breast',
      estimatedPortion: '170 g',
      estimatedCalories: 280,
      confidence: 'high'
    },
    {
      id: 'food-2',
      name: 'White rice',
      estimatedPortion: '1.5 cups',
      estimatedCalories: 310,
      confidence: 'medium'
    },
    {
      id: 'food-3',
      name: 'Broccoli',
      estimatedPortion: '1 cup',
      estimatedCalories: 55,
      confidence: 'high'
    }
  ],
  estimatedTotalCalories: 645,
  estimatedLowCalories: 560,
  estimatedHighCalories: 760,
  confidence: 'medium',
  notes: ['Cooking oil or sauces could increase the calorie estimate.'],
  questions: [
    {
      id: 'question-1',
      prompt: 'How much rice was this?',
      options: ['1/2 cup', '1 cup', '1 1/2 cups', '2 cups', 'Not sure']
    }
  ]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isConfidence(value: unknown): value is MealScanConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, milliseconds);

    function handleAbort() {
      window.clearTimeout(timer);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    }

    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function getScaledDimensions(width: number, height: number): { width: number; height: number } {
  if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
    return { width, height };
  }

  const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);

  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new MealScannerError(
          'unsupported_image',
          'This image format could not be processed.'
        )
      );
    };

    image.src = url;
  });
}

function canvasToFile(canvas: HTMLCanvasElement, originalFileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new MealScannerError(
              'request_failed',
              'The image could not be prepared for upload.'
            )
          );
          return;
        }

        const nextName = originalFileName.replace(/\.[^.]+$/, '') || 'meal-photo';
        resolve(new File([blob], `${nextName}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}

function normalizeFoods(value: unknown): DetectedFood[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!isRecord(item)) {
        return null;
      }

      if (
        typeof item.name !== 'string' ||
        typeof item.estimatedPortion !== 'string' ||
        typeof item.estimatedCalories !== 'number' ||
        !Number.isFinite(item.estimatedCalories)
      ) {
        return null;
      }

      return {
        id: typeof item.id === 'string' ? item.id : `food-${index + 1}`,
        name: item.name,
        estimatedPortion: item.estimatedPortion,
        estimatedCalories: Math.round(item.estimatedCalories),
        confidence: isConfidence(item.confidence) ? item.confidence : 'medium'
      };
    })
    .filter((item): item is DetectedFood => item !== null);
}

function normalizeQuestions(value: unknown): MealScanQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!isRecord(item) || typeof item.prompt !== 'string' || !Array.isArray(item.options)) {
        return null;
      }

      const options = item.options.filter((option): option is string => typeof option === 'string');

      if (options.length === 0) {
        return null;
      }

      return {
        id: typeof item.id === 'string' ? item.id : `question-${index + 1}`,
        prompt: item.prompt,
        options
      };
    })
    .filter((item): item is MealScanQuestion => item !== null);
}

function normalizeResult(value: unknown): MealScanResult {
  if (!isRecord(value)) {
    throw new MealScannerError(
      'invalid_response',
      'The meal scanner returned malformed data.'
    );
  }

  const foods = normalizeFoods(value.foods);

  if (foods.length === 0) {
    throw new MealScannerError('no_food', 'No food was clearly detected in this image.');
  }

  const totalCalories =
    typeof value.estimatedTotalCalories === 'number' && Number.isFinite(value.estimatedTotalCalories)
      ? Math.round(value.estimatedTotalCalories)
      : foods.reduce((sum, item) => sum + item.estimatedCalories, 0);

  const lowCalories =
    typeof value.estimatedLowCalories === 'number' && Number.isFinite(value.estimatedLowCalories)
      ? Math.round(value.estimatedLowCalories)
      : totalCalories;
  const highCalories =
    typeof value.estimatedHighCalories === 'number' && Number.isFinite(value.estimatedHighCalories)
      ? Math.round(value.estimatedHighCalories)
      : totalCalories;

  return {
    foods,
    estimatedTotalCalories: totalCalories,
    estimatedLowCalories: Math.min(lowCalories, highCalories),
    estimatedHighCalories: Math.max(lowCalories, highCalories),
    confidence: isConfidence(value.confidence) ? value.confidence : 'medium',
    notes: Array.isArray(value.notes)
      ? value.notes.filter((note): note is string => typeof note === 'string')
      : [],
    questions: normalizeQuestions(value.questions)
  };
}

export function isMealScannerMockMode(): boolean {
  return !MEAL_SCANNER_ENDPOINT;
}

export function getMealScannerErrorMessage(error: unknown): string {
  if (error instanceof MealScannerError) {
    return error.message;
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Meal analysis was canceled.';
  }

  return "We couldn't analyze this meal right now.";
}

export async function prepareMealImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new MealScannerError(
      'unsupported_image',
      'Please choose a supported image file.'
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new MealScannerError(
      'image_too_large',
      'This image is too large to upload. Try a smaller photo.'
    );
  }

  const image = await loadImage(file);
  const { width, height } = getScaledDimensions(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new MealScannerError(
      'request_failed',
      'The image could not be prepared for upload.'
    );
  }

  context.drawImage(image, 0, 0, width, height);

  return canvasToFile(canvas, file.name);
}

export async function analyzeMeal(file: File, signal?: AbortSignal): Promise<MealScanResult> {
  if (!navigator.onLine) {
    throw new MealScannerError(
      'offline',
      'Meal scanning requires an internet connection.'
    );
  }

  const preparedFile = await prepareMealImage(file);

  if (isMealScannerMockMode()) {
    await sleep(900, signal);
    return structuredClone(MOCK_RESULT);
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  const requestController = new AbortController();

  function handleAbort() {
    requestController.abort();
  }

  signal?.addEventListener('abort', handleAbort, { once: true });
  controller.signal.addEventListener('abort', handleAbort, { once: true });

  try {
    const formData = new FormData();
    formData.append('image', preparedFile);

    const response = await fetch(MEAL_SCANNER_ENDPOINT, {
      method: 'POST',
      body: formData,
      signal: requestController.signal
    });

    if (response.status === 413) {
      throw new MealScannerError(
        'image_too_large',
        'This image is too large to analyze.'
      );
    }

    if (response.status === 429) {
      throw new MealScannerError(
        'rate_limited',
        'Meal scanning is temporarily rate limited. Please try again soon.'
      );
    }

    if (response.status >= 500) {
      throw new MealScannerError(
        'backend_unavailable',
        "We couldn't analyze this meal right now."
      );
    }

    if (!response.ok) {
      throw new MealScannerError(
        'server_error',
        "We couldn't analyze this meal right now."
      );
    }

    const result = normalizeResult(await response.json());
    return result;
  } catch (error) {
    if (error instanceof MealScannerError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new MealScannerError('timeout', 'Meal analysis timed out. Please try again.');
    }

    throw new MealScannerError(
      'request_failed',
      "We couldn't analyze this meal right now."
    );
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', handleAbort);
    controller.signal.removeEventListener('abort', handleAbort);
  }
}
