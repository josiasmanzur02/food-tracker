export type AppPage = 'today' | 'progress' | 'history' | 'settings';
export type AppTheme = 'system' | 'light' | 'dark';
export type UnitSystem = 'imperial' | 'metric';
export type Sex = 'male' | 'female';
export type ActivityLevelId =
  | 'sedentary'
  | 'lightlyActive'
  | 'moderatelyActive'
  | 'veryActive'
  | 'highlyActive';
export type GoalType = 'lose' | 'maintain' | 'gain';
export type LossGoalRate = 'slow' | 'moderate' | 'faster' | 'aggressive';
export type GainGoalRate = 'slow' | 'moderate' | 'faster';
export type GoalRate = LossGoalRate | GainGoalRate;
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other';
export type EntrySource = 'manual' | 'ai';
export type MealScanConfidence = 'low' | 'medium' | 'high';

export interface ActivityLevelOption {
  id: ActivityLevelId;
  name: string;
  description: string;
  multiplier: number;
}

export interface GoalRateOption {
  id: GoalRate;
  name: string;
  description: string;
}

export interface DetectedFood {
  id: string;
  name: string;
  estimatedPortion: string;
  estimatedCalories: number;
  confidence: MealScanConfidence;
}

export interface MealScanQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export interface MealScanResult {
  foods: DetectedFood[];
  estimatedTotalCalories: number;
  estimatedLowCalories: number;
  estimatedHighCalories: number;
  confidence: MealScanConfidence;
  notes: string[];
  questions: MealScanQuestion[];
}

export interface AICalorieMetadata {
  foods: DetectedFood[];
  confidence: MealScanConfidence;
  estimatedLowCalories: number;
  estimatedHighCalories: number;
  notes: string[];
}

export interface CalorieEntry {
  id: string;
  date: string;
  calories: number;
  description?: string;
  meal?: MealType;
  source: EntrySource;
  createdAt: string;
  updatedAt: string;
  aiMetadata?: AICalorieMetadata;
}

export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  unitSystem: UnitSystem;
  age: number;
  heightCm: number;
  sex: Sex;
  startingWeightKg: number;
  goalWeightKg: number;
  activityLevel: ActivityLevelId;
  goalType: GoalType;
  goalRate: GoalRate | null;
  maintenanceCalories: number;
  calculatedTargetCalories: number;
  customTargetCalories: number | null;
  targetNotice: string | null;
  createdAt: string;
  updatedAt: string;
  onboardedAt: string;
}

export interface AppSettings {
  theme: AppTheme;
}

export interface AppData {
  dataVersion: number;
  profile: UserProfile | null;
  settings: AppSettings;
  calorieEntries: CalorieEntry[];
  weightEntries: WeightEntry[];
}

export interface ImportPreview {
  data: AppData;
  calorieEntryCount: number;
  weightEntryCount: number;
  profileCreatedAt: string | null;
}
