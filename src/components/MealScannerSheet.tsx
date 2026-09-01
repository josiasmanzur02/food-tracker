import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalorieEntry, DetectedFood, MealScanResult } from '../types';
import {
  analyzeMeal,
  getMealScannerErrorMessage,
  isMealScannerMockMode
} from '../services/mealScanner';
import { ModalShell } from './ModalShell';

interface MealScannerSheetProps {
  open: boolean;
  isOnline: boolean;
  onClose: () => void;
  onAddMeal: (input: {
    calories: number;
    description: string;
    aiMetadata: CalorieEntry['aiMetadata'];
  }) => void;
  onAddManual: () => void;
}

function createFoodId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `food-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildMealDescription(foods: DetectedFood[]): string {
  const names = foods
    .map((food) => food.name.trim())
    .filter(Boolean)
    .slice(0, 3);

  return names.length > 0 ? names.join(', ') : 'AI meal estimate';
}

export default function MealScannerSheet({
  open,
  isOnline,
  onClose,
  onAddMeal,
  onAddManual
}: MealScannerSheetProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<MealScanResult | null>(null);
  const [foods, setFoods] = useState<DetectedFood[]>([]);
  const [totalCalories, setTotalCalories] = useState('');
  const [totalDirty, setTotalDirty] = useState(false);

  const computedTotalCalories = useMemo(
    () => foods.reduce((sum, food) => sum + food.estimatedCalories, 0),
    [foods]
  );

  useEffect(() => {
    if (!open) {
      abortControllerRef.current?.abort();
      setSelectedFile(null);
      setPreviewUrl('');
      setAnalyzing(false);
      setErrorMessage(null);
      setResult(null);
      setFoods([]);
      setTotalCalories('');
      setTotalDirty(false);
      return;
    }

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [open]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  useEffect(() => {
    if (!totalDirty) {
      setTotalCalories(String(computedTotalCalories));
    }
  }, [computedTotalCalories, totalDirty]);

  function updateFromResult(nextResult: MealScanResult) {
    setResult(nextResult);
    setFoods(nextResult.foods);
    setTotalCalories(String(nextResult.estimatedTotalCalories));
    setTotalDirty(false);
  }

  function handleFileSelection(fileList: FileList | null) {
    const nextFile = fileList?.[0] ?? null;
    setSelectedFile(nextFile);
    setErrorMessage(null);
    setResult(null);
    setFoods([]);
    setTotalCalories('');
    setTotalDirty(false);
  }

  async function handleAnalyze() {
    if (!selectedFile || analyzing) {
      return;
    }

    setAnalyzing(true);
    setErrorMessage(null);
    abortControllerRef.current = new AbortController();

    try {
      const nextResult = await analyzeMeal(selectedFile, abortControllerRef.current.signal);
      updateFromResult(nextResult);
    } catch (error) {
      setErrorMessage(getMealScannerErrorMessage(error));
    } finally {
      setAnalyzing(false);
      abortControllerRef.current = null;
    }
  }

  function updateFood(foodId: string, field: keyof DetectedFood, value: string) {
    setFoods((currentFoods) =>
      currentFoods.map((food) =>
        food.id === foodId
          ? {
              ...food,
              [field]:
                field === 'estimatedCalories'
                  ? Math.max(0, Math.round(Number(value) || 0))
                  : value
            }
          : food
      )
    );
  }

  function handleAddMeal() {
    const parsedTotal = Number(totalCalories);

    if (!Number.isFinite(parsedTotal) || parsedTotal <= 0) {
      setErrorMessage('Enter a valid total calorie estimate before saving.');
      return;
    }

    const description = buildMealDescription(foods);

    onAddMeal({
      calories: parsedTotal,
      description,
      aiMetadata: {
        foods,
        confidence: result?.confidence ?? 'medium',
        estimatedLowCalories: result?.estimatedLowCalories ?? parsedTotal,
        estimatedHighCalories: result?.estimatedHighCalories ?? parsedTotal,
        notes: result?.notes ?? []
      }
    });
  }

  return (
    <ModalShell open={open} title="Scan Meal" onClose={onClose} panelClassName="meal-sheet">
      <div className="meal-scanner">
        <p className="supporting-copy">
          Take a clear photo of your meal to estimate its calories.
        </p>
        {isMealScannerMockMode() ? (
          <div className="notice-card">
            <p>Mock mode is active until `VITE_MEAL_SCANNER_API_URL` is configured.</p>
          </div>
        ) : null}
        {!isOnline ? (
          <div className="notice-card notice-card--warning">
            <p>Meal scanning requires an internet connection.</p>
          </div>
        ) : null}

        <div className="meal-scanner__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => cameraInputRef.current?.click()}
          >
            Take Photo
          </button>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => uploadInputRef.current?.click()}
          >
            Upload Existing Photo
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => handleFileSelection(event.target.files)}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => handleFileSelection(event.target.files)}
          />
        </div>

        {previewUrl ? (
          <div className="meal-scanner__preview">
            <img src={previewUrl} alt="Selected meal preview" />
          </div>
        ) : null}

        {!result ? (
          <div className="sheet-actions meal-scanner__footer">
            <button type="button" className="button button--ghost" onClick={onAddManual}>
              Add Calories Manually
            </button>
            <button
              type="button"
              className="button button--primary"
              disabled={!selectedFile || analyzing || !isOnline}
              onClick={handleAnalyze}
            >
              {analyzing ? 'Analyzing meal…' : 'Analyze Meal'}
            </button>
          </div>
        ) : null}

        {errorMessage ? <p className="form-message form-message--error">{errorMessage}</p> : null}

        {result ? (
          <div className="meal-results">
            <div className="meal-results__summary">
              <div>
                <p className="stat-label">Estimated Calories</p>
                <p className="hero-card__value hero-card__value--small">
                  {Number(totalCalories || 0).toLocaleString()} kcal
                </p>
              </div>
              <div>
                <p className="stat-label">Likely Range</p>
                <p className="stat-value">
                  {result.estimatedLowCalories.toLocaleString()}–{result.estimatedHighCalories.toLocaleString()} kcal
                </p>
              </div>
              <div>
                <p className="stat-label">Confidence</p>
                <p className="stat-value">{capitalize(result.confidence)}</p>
              </div>
            </div>

            <p className="supporting-copy">
              Photo-based calorie estimates may be inaccurate. Portion size, cooking oils,
              sauces, ingredients and preparation methods can significantly affect calories.
            </p>

            <div className="meal-results__foods">
              {foods.map((food) => (
                <div key={food.id} className="food-editor">
                  <label className="field">
                    <span>Food</span>
                    <input
                      type="text"
                      value={food.name}
                      onChange={(event) => updateFood(food.id, 'name', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Portion</span>
                    <input
                      type="text"
                      value={food.estimatedPortion}
                      onChange={(event) =>
                        updateFood(food.id, 'estimatedPortion', event.target.value)
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Calories</span>
                    <input
                      inputMode="numeric"
                      type="number"
                      min="0"
                      step="1"
                      value={food.estimatedCalories}
                      onChange={(event) =>
                        updateFood(food.id, 'estimatedCalories', event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="button button--inline"
                    onClick={() =>
                      setFoods((currentFoods) =>
                        currentFoods.filter((item) => item.id !== food.id)
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <div className="meal-results__tools">
              <button
                type="button"
                className="button button--ghost"
                onClick={() =>
                  setFoods((currentFoods) => [
                    ...currentFoods,
                    {
                      id: createFoodId(),
                      name: '',
                      estimatedPortion: '',
                      estimatedCalories: 0,
                      confidence: 'medium'
                    }
                  ])
                }
              >
                Add Missing Food
              </button>
            </div>

            <label className="field">
              <span>Total calories</span>
              <input
                inputMode="numeric"
                type="number"
                min="0"
                step="1"
                value={totalCalories}
                onChange={(event) => {
                  setTotalDirty(true);
                  setTotalCalories(event.target.value);
                }}
              />
            </label>

            {result.notes.length > 0 ? (
              <div className="notes-list">
                {result.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            ) : null}

            {result.questions.length > 0 ? (
              <div className="card card--subtle">
                <p className="section-label">Follow-up questions</p>
                {result.questions.map((question) => (
                  <div key={question.id} className="question-block">
                    <p>{question.prompt}</p>
                    <div className="question-options">
                      {question.options.map((option) => (
                        <span key={option} className="pill pill--muted">
                          {option}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="sheet-actions meal-scanner__footer">
              <button type="button" className="button button--ghost" onClick={onAddManual}>
                Add Calories Manually
              </button>
              <button type="button" className="button button--primary" onClick={handleAddMeal}>
                Add Meal to Today
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </ModalShell>
  );
}
