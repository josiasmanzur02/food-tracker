import type {
  ActivityLevelId,
  AppData,
  AppSettings,
  CalorieEntry,
  DetectedFood,
  ImportPreview,
  MealScanConfidence,
  MealType,
  UserProfile,
  WeightEntry
} from '../types';

const STORAGE_KEY = 'calorietrack.appdata';
const DATA_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system'
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `ct-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMealType(value: unknown): value is MealType {
  return (
    value === 'breakfast' ||
    value === 'lunch' ||
    value === 'dinner' ||
    value === 'snack' ||
    value === 'other'
  );
}

function isActivityLevel(value: unknown): value is ActivityLevelId {
  return (
    value === 'sedentary' ||
    value === 'lightlyActive' ||
    value === 'moderatelyActive' ||
    value === 'veryActive' ||
    value === 'highlyActive'
  );
}

function isGoalRate(value: unknown): value is UserProfile['goalRate'] {
  return (
    value === null ||
    value === 'slow' ||
    value === 'moderate' ||
    value === 'faster' ||
    value === 'aggressive'
  );
}

function isConfidence(value: unknown): value is MealScanConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function createEmptyAppData(): AppData {
  return {
    dataVersion: DATA_VERSION,
    profile: null,
    settings: DEFAULT_SETTINGS,
    calorieEntries: [],
    weightEntries: []
  };
}

function normalizeFoods(value: unknown): DetectedFood[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const estimatedCalories = item.estimatedCalories;

      if (
        typeof item.id !== 'string' ||
        typeof item.name !== 'string' ||
        typeof item.estimatedPortion !== 'string' ||
        !isFiniteNumber(estimatedCalories) ||
        !isConfidence(item.confidence)
      ) {
        return null;
      }

      return {
        id: item.id,
        name: item.name,
        estimatedPortion: item.estimatedPortion,
        estimatedCalories,
        confidence: item.confidence
      };
    })
    .filter((item): item is DetectedFood => item !== null);
}

function normalizeCalorieEntry(value: unknown): CalorieEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.date !== 'string' ||
    !isFiniteNumber(value.calories) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    (value.source !== 'manual' && value.source !== 'ai')
  ) {
    return null;
  }

  const normalizedEntry: CalorieEntry = {
    id: value.id,
    date: value.date,
    calories: Math.round(value.calories),
    description: typeof value.description === 'string' ? value.description : undefined,
    meal: isMealType(value.meal) ? value.meal : undefined,
    source: value.source,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };

  if (isRecord(value.aiMetadata)) {
    normalizedEntry.aiMetadata = {
      foods: normalizeFoods(value.aiMetadata.foods),
      confidence: isConfidence(value.aiMetadata.confidence)
        ? value.aiMetadata.confidence
        : 'medium',
      estimatedLowCalories: isFiniteNumber(value.aiMetadata.estimatedLowCalories)
        ? Math.round(value.aiMetadata.estimatedLowCalories)
        : normalizedEntry.calories,
      estimatedHighCalories: isFiniteNumber(value.aiMetadata.estimatedHighCalories)
        ? Math.round(value.aiMetadata.estimatedHighCalories)
        : normalizedEntry.calories,
      notes: Array.isArray(value.aiMetadata.notes)
        ? value.aiMetadata.notes.filter((note): note is string => typeof note === 'string')
        : []
    };
  }

  return normalizedEntry;
}

function normalizeWeightEntry(value: unknown): WeightEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.date !== 'string' ||
    !isFiniteNumber(value.weightKg) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    date: value.date,
    weightKg: Number(value.weightKg.toFixed(4)),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

function normalizeProfile(value: unknown): UserProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.id !== 'string' ||
    typeof value.unitSystem !== 'string' ||
    !isFiniteNumber(value.age) ||
    !isFiniteNumber(value.heightCm) ||
    (value.sex !== 'male' && value.sex !== 'female') ||
    !isFiniteNumber(value.startingWeightKg) ||
    !isFiniteNumber(value.goalWeightKg) ||
    !isActivityLevel(value.activityLevel) ||
    (value.goalType !== 'lose' && value.goalType !== 'maintain' && value.goalType !== 'gain') ||
    !isFiniteNumber(value.maintenanceCalories) ||
    !isFiniteNumber(value.calculatedTargetCalories) ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    typeof value.onboardedAt !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    unitSystem: value.unitSystem === 'metric' ? 'metric' : 'imperial',
    age: Math.round(value.age),
    heightCm: Number(value.heightCm.toFixed(2)),
    sex: value.sex,
    startingWeightKg: Number(value.startingWeightKg.toFixed(4)),
    goalWeightKg: Number(value.goalWeightKg.toFixed(4)),
    activityLevel: value.activityLevel,
    goalType: value.goalType,
    goalRate: isGoalRate(value.goalRate) ? value.goalRate : null,
    maintenanceCalories: Math.round(value.maintenanceCalories),
    calculatedTargetCalories: Math.round(value.calculatedTargetCalories),
    customTargetCalories: isFiniteNumber(value.customTargetCalories)
      ? Math.round(value.customTargetCalories)
      : null,
    targetNotice: typeof value.targetNotice === 'string' ? value.targetNotice : null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    onboardedAt: value.onboardedAt
  };
}

function normalizeSettings(value: unknown): AppSettings {
  if (!isRecord(value)) {
    return DEFAULT_SETTINGS;
  }

  return {
    theme: value.theme === 'light' || value.theme === 'dark' ? value.theme : 'system'
  };
}

function dedupeWeightEntries(entries: WeightEntry[]): WeightEntry[] {
  const latestByDate = new Map<string, WeightEntry>();

  for (const entry of entries) {
    const existing = latestByDate.get(entry.date);

    if (!existing || existing.updatedAt < entry.updatedAt) {
      latestByDate.set(entry.date, entry);
    }
  }

  return Array.from(latestByDate.values()).sort((left, right) =>
    right.date.localeCompare(left.date)
  );
}

function sortCalorieEntries(entries: CalorieEntry[]): CalorieEntry[] {
  return [...entries].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

export function migrateData(value: unknown): AppData {
  if (!isRecord(value)) {
    return createEmptyAppData();
  }

  const calorieEntries = Array.isArray(value.calorieEntries)
    ? value.calorieEntries
        .map((entry) => normalizeCalorieEntry(entry))
        .filter((entry): entry is CalorieEntry => entry !== null)
    : [];
  const weightEntries = Array.isArray(value.weightEntries)
    ? value.weightEntries
        .map((entry) => normalizeWeightEntry(entry))
        .filter((entry): entry is WeightEntry => entry !== null)
    : [];

  return {
    dataVersion: DATA_VERSION,
    profile: normalizeProfile(value.profile),
    settings: normalizeSettings(value.settings),
    calorieEntries: sortCalorieEntries(calorieEntries),
    weightEntries: dedupeWeightEntries(weightEntries)
  };
}

function readStorage(): AppData {
  if (!canUseStorage()) {
    return createEmptyAppData();
  }

  const rawValue = window.localStorage.getItem(STORAGE_KEY);

  if (!rawValue) {
    return createEmptyAppData();
  }

  try {
    return migrateData(JSON.parse(rawValue));
  } catch {
    return createEmptyAppData();
  }
}

export function saveAppData(data: AppData): AppData {
  const normalizedData = migrateData(data);

  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedData));
  }

  return normalizedData;
}

export function getAppData(): AppData {
  return readStorage();
}

export function getProfile(): UserProfile | null {
  return getAppData().profile;
}

function updateAppData(updater: (data: AppData) => AppData): AppData {
  const currentData = getAppData();
  const nextData = updater(currentData);
  return saveAppData(nextData);
}

export function saveProfile(profile: UserProfile): AppData {
  return updateAppData((data) => ({
    ...data,
    profile
  }));
}

export function saveSettings(settings: AppSettings): AppData {
  return updateAppData((data) => ({
    ...data,
    settings
  }));
}

export function getDailyEntries(date: string): CalorieEntry[] {
  return getAppData().calorieEntries.filter((entry) => entry.date === date);
}

export interface SaveCalorieEntryInput {
  id?: string;
  date: string;
  calories: number;
  description?: string;
  meal?: MealType;
  source: CalorieEntry['source'];
  aiMetadata?: CalorieEntry['aiMetadata'];
}

export function addCalorieEntry(input: SaveCalorieEntryInput): AppData {
  return updateAppData((data) => {
    const now = new Date().toISOString();
    const entry: CalorieEntry = {
      id: input.id ?? createId(),
      date: input.date,
      calories: Math.round(input.calories),
      description: input.description?.trim() ? input.description.trim() : undefined,
      meal: input.meal,
      source: input.source,
      aiMetadata: input.aiMetadata,
      createdAt: now,
      updatedAt: now
    };

    return {
      ...data,
      calorieEntries: sortCalorieEntries([entry, ...data.calorieEntries])
    };
  });
}

export function updateCalorieEntry(
  id: string,
  input: Omit<SaveCalorieEntryInput, 'source' | 'date'> & {
    date: string;
  }
): AppData {
  return updateAppData((data) => {
    const now = new Date().toISOString();
    const existingEntry = data.calorieEntries.find((entry) => entry.id === id);

    if (!existingEntry) {
      return data;
    }

    const updatedEntry: CalorieEntry = {
      ...existingEntry,
      date: input.date,
      calories: Math.round(input.calories),
      description: input.description?.trim() ? input.description.trim() : undefined,
      meal: input.meal,
      aiMetadata: input.aiMetadata ?? existingEntry.aiMetadata,
      updatedAt: now
    };

    return {
      ...data,
      calorieEntries: sortCalorieEntries(
        data.calorieEntries.map((entry) => (entry.id === id ? updatedEntry : entry))
      )
    };
  });
}

export function deleteCalorieEntry(id: string): AppData {
  return updateAppData((data) => ({
    ...data,
    calorieEntries: data.calorieEntries.filter((entry) => entry.id !== id)
  }));
}

export function getWeightEntries(): WeightEntry[] {
  return getAppData().weightEntries;
}

export interface SaveWeightEntryInput {
  id?: string;
  date: string;
  weightKg: number;
}

export function saveWeightEntry(input: SaveWeightEntryInput): AppData {
  return updateAppData((data) => {
    const now = new Date().toISOString();
    const existingById = input.id
      ? data.weightEntries.find((entry) => entry.id === input.id)
      : null;
    const existingByDate = data.weightEntries.find((entry) => entry.date === input.date);
    const baseEntry = existingById ?? existingByDate;

    const nextEntry: WeightEntry = {
      id: baseEntry?.id ?? createId(),
      date: input.date,
      weightKg: Number(input.weightKg.toFixed(4)),
      createdAt: baseEntry?.createdAt ?? now,
      updatedAt: now
    };

    const filteredEntries = data.weightEntries.filter((entry) => {
      if (existingById && entry.id === existingById.id) {
        return false;
      }

      if (existingByDate && entry.id === existingByDate.id) {
        return false;
      }

      return true;
    });

    return {
      ...data,
      weightEntries: dedupeWeightEntries([nextEntry, ...filteredEntries])
    };
  });
}

export function deleteWeightEntry(id: string): AppData {
  return updateAppData((data) => ({
    ...data,
    weightEntries: data.weightEntries.filter((entry) => entry.id !== id)
  }));
}

export function exportData(): string {
  return JSON.stringify(getAppData(), null, 2);
}

export function parseImportData(fileContents: string): ImportPreview {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(fileContents);
  } catch {
    throw new Error('This file is not valid JSON.');
  }

  const normalizedData = migrateData(parsedValue);

  if (!normalizedData.profile) {
    throw new Error('This backup does not contain a valid CalorieTrack profile.');
  }

  return {
    data: normalizedData,
    calorieEntryCount: normalizedData.calorieEntries.length,
    weightEntryCount: normalizedData.weightEntries.length,
    profileCreatedAt: normalizedData.profile.createdAt
  };
}

export function importData(nextData: AppData): AppData {
  return saveAppData(nextData);
}

export function resetData(): AppData {
  const emptyData = createEmptyAppData();

  if (canUseStorage()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return emptyData;
}
