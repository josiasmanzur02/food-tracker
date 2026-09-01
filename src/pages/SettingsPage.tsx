import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityLevelId,
  AppSettings,
  AppTheme,
  GoalRate,
  GoalType,
  Sex,
  UnitSystem,
  UserProfile
} from '../types';
import { AppHeader } from '../components/AppHeader';
import {
  ACTIVITY_LEVELS,
  GAIN_GOAL_RATES,
  LOSS_GOAL_RATES,
  calculateGoalType
} from '../utils/calories';
import { cmToFeetInches, convertWeightToKg, feetInchesToCm, formatWeight } from '../utils/units';

interface SettingsPageProps {
  profile: UserProfile;
  settings: AppSettings;
  currentWeightKg: number;
  onSaveProfile: (input: {
    unitSystem: UnitSystem;
    age: number;
    heightCm: number;
    sex: Sex;
    activityLevel: ActivityLevelId;
  }) => void;
  onSaveGoal: (input: {
    goalWeightKg: number;
    goalRate: GoalRate | null;
    customTargetCalories: number | null;
  }) => void;
  onRecalculateTarget: () => void;
  onResetCalculatedTarget: () => void;
  onChangeTheme: (theme: AppTheme) => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
  onResetData: () => void;
}

interface ProfileDraft {
  unitSystem: UnitSystem;
  age: string;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  sex: Sex;
  activityLevel: ActivityLevelId;
}

interface GoalDraft {
  goalWeight: string;
  customTarget: string;
  goalRate: GoalRate;
}

function buildProfileDraft(profile: UserProfile): ProfileDraft {
  const height = cmToFeetInches(profile.heightCm);

  return {
    unitSystem: profile.unitSystem,
    age: String(profile.age),
    heightCm: String(Math.round(profile.heightCm)),
    heightFeet: String(height.feet),
    heightInches: String(height.inches),
    sex: profile.sex,
    activityLevel: profile.activityLevel
  };
}

function buildGoalDraft(profile: UserProfile): GoalDraft {
  return {
    goalWeight: formatWeight(profile.goalWeightKg, profile.unitSystem).replace(/ (lb|kg)$/, ''),
    customTarget: profile.customTargetCalories ? String(profile.customTargetCalories) : '',
    goalRate: (profile.goalRate ?? 'moderate') as GoalRate
  };
}

function getHeightCm(draft: ProfileDraft): number | null {
  if (draft.unitSystem === 'metric') {
    const parsed = Number(draft.heightCm);
    return Number.isFinite(parsed) ? parsed : null;
  }

  const feet = Number(draft.heightFeet);
  const inches = Number(draft.heightInches || 0);

  if (!Number.isFinite(feet) || !Number.isFinite(inches)) {
    return null;
  }

  return feetInchesToCm(feet, inches);
}

export function SettingsPage({
  profile,
  settings,
  currentWeightKg,
  onSaveProfile,
  onSaveGoal,
  onRecalculateTarget,
  onResetCalculatedTarget,
  onChangeTheme,
  onExport,
  onImportFile,
  onResetData
}: SettingsPageProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => buildProfileDraft(profile));
  const [goalDraft, setGoalDraft] = useState<GoalDraft>(() => buildGoalDraft(profile));
  const [profileError, setProfileError] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);

  useEffect(() => {
    setProfileDraft(buildProfileDraft(profile));
    setGoalDraft(buildGoalDraft(profile));
  }, [profile]);

  const goalWeightKg = useMemo(() => {
    const parsed = Number(goalDraft.goalWeight);
    return Number.isFinite(parsed) ? convertWeightToKg(parsed, profileDraft.unitSystem) : null;
  }, [goalDraft.goalWeight, profileDraft.unitSystem]);
  const nextGoalType: GoalType = goalWeightKg
    ? calculateGoalType(currentWeightKg, goalWeightKg)
    : profile.goalType;
  const goalRateOptions =
    nextGoalType === 'gain' ? GAIN_GOAL_RATES : LOSS_GOAL_RATES;

  function handleUnitChange(nextUnitSystem: UnitSystem) {
    setProfileDraft((currentDraft) => {
      if (currentDraft.unitSystem === nextUnitSystem) {
        return currentDraft;
      }

      const currentHeightCm = getHeightCm(currentDraft);
      const height = currentHeightCm ? cmToFeetInches(currentHeightCm) : null;

      setGoalDraft((currentGoalDraft) => {
        const currentGoalWeight = Number(currentGoalDraft.goalWeight);
        const convertedGoalWeight =
          Number.isFinite(currentGoalWeight) && currentGoalWeight > 0
            ? convertWeightToKg(currentGoalWeight, currentDraft.unitSystem)
            : null;

        return {
          ...currentGoalDraft,
          goalWeight: convertedGoalWeight
            ? formatWeight(convertedGoalWeight, nextUnitSystem).replace(/ (lb|kg)$/, '')
            : ''
        };
      });

      return {
        ...currentDraft,
        unitSystem: nextUnitSystem,
        heightCm:
          nextUnitSystem === 'metric' && currentHeightCm
            ? String(Math.round(currentHeightCm))
            : '',
        heightFeet:
          nextUnitSystem === 'imperial' && height ? String(height.feet) : '',
        heightInches:
          nextUnitSystem === 'imperial' && height ? String(height.inches) : ''
      };
    });
  }

  function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const age = Number(profileDraft.age);
    const heightCm = getHeightCm(profileDraft);

    if (!Number.isFinite(age) || age < 10 || age > 120) {
      setProfileError('Enter a valid age.');
      return;
    }

    if (!heightCm || heightCm < 90 || heightCm > 260) {
      setProfileError('Enter a valid height.');
      return;
    }

    setProfileError(null);
    onSaveProfile({
      unitSystem: profileDraft.unitSystem,
      age,
      heightCm,
      sex: profileDraft.sex,
      activityLevel: profileDraft.activityLevel
    });
  }

  function handleGoalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!goalWeightKg || goalWeightKg <= 0) {
      setGoalError('Enter a valid goal weight.');
      return;
    }

    const customTarget =
      goalDraft.customTarget.trim() === ''
        ? null
        : Number(goalDraft.customTarget);

    if (
      customTarget !== null &&
      (!Number.isFinite(customTarget) || customTarget <= 0 || customTarget > 10000)
    ) {
      setGoalError('Enter a realistic custom daily target.');
      return;
    }

    setGoalError(null);
    onSaveGoal({
      goalWeightKg,
      goalRate: nextGoalType === 'maintain' ? null : goalDraft.goalRate,
      customTargetCalories: customTarget
    });
  }

  return (
    <div className="page">
      <AppHeader
        eyebrow="Settings"
        title="Profile and data"
        subtitle="Your calorie data stays on this device unless you export it."
      />

      <section className="card">
        <div className="card__header">
          <div>
            <p className="section-label">Profile</p>
            <h2>Personal details</h2>
          </div>
        </div>
        <form className="stack" onSubmit={handleProfileSubmit}>
          <div className="field-row">
            <label className="field">
              <span>Units</span>
              <select
                value={profileDraft.unitSystem}
                onChange={(event) =>
                  handleUnitChange(event.target.value as UnitSystem)
                }
              >
                <option value="imperial">Imperial</option>
                <option value="metric">Metric</option>
              </select>
            </label>
            <label className="field">
              <span>Age</span>
              <input
                inputMode="numeric"
                type="number"
                value={profileDraft.age}
                onChange={(event) =>
                  setProfileDraft((current) => ({ ...current, age: event.target.value }))
                }
              />
            </label>
          </div>
          {profileDraft.unitSystem === 'metric' ? (
            <label className="field">
              <span>Height (cm)</span>
              <input
                inputMode="numeric"
                type="number"
                value={profileDraft.heightCm}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    heightCm: event.target.value
                  }))
                }
              />
            </label>
          ) : (
            <div className="field-row">
              <label className="field">
                <span>Height (ft)</span>
                <input
                  inputMode="numeric"
                  type="number"
                  value={profileDraft.heightFeet}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      heightFeet: event.target.value
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Height (in)</span>
                <input
                  inputMode="numeric"
                  type="number"
                  value={profileDraft.heightInches}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      heightInches: event.target.value
                    }))
                  }
                />
              </label>
            </div>
          )}
          <div className="field-row">
            <label className="field">
              <span>Sex used for calculation</span>
              <select
                value={profileDraft.sex}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    sex: event.target.value as Sex
                  }))
                }
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
            <label className="field">
              <span>Activity level</span>
              <select
                value={profileDraft.activityLevel}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    activityLevel: event.target.value as ActivityLevelId
                  }))
                }
              >
                {ACTIVITY_LEVELS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {profile.customTargetCalories ? (
            <p className="supporting-copy">
              A custom daily target is active. Saving profile changes will refresh your
              estimate without overwriting the custom target.
            </p>
          ) : null}
          {profileError ? <p className="form-message form-message--error">{profileError}</p> : null}
          <div className="sheet-actions">
            <span />
            <button type="submit" className="button button--primary">
              Save Profile
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="section-label">Goal</p>
            <h2>Target settings</h2>
          </div>
        </div>
        <form className="stack" onSubmit={handleGoalSubmit}>
          <label className="field">
            <span>Goal weight ({profileDraft.unitSystem === 'imperial' ? 'lb' : 'kg'})</span>
            <input
              inputMode="decimal"
              type="number"
              min="0"
              step="0.1"
              value={goalDraft.goalWeight}
              onChange={(event) =>
                setGoalDraft((current) => ({
                  ...current,
                  goalWeight: event.target.value
                }))
              }
            />
          </label>
          {nextGoalType !== 'maintain' ? (
            <label className="field">
              <span>Goal pace</span>
              <select
                value={goalDraft.goalRate}
                onChange={(event) =>
                  setGoalDraft((current) => ({
                    ...current,
                    goalRate: event.target.value as GoalRate
                  }))
                }
              >
                {goalRateOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>Custom daily target (optional)</span>
            <input
              inputMode="numeric"
              type="number"
              min="0"
              step="1"
              value={goalDraft.customTarget}
              onChange={(event) =>
                setGoalDraft((current) => ({
                  ...current,
                  customTarget: event.target.value
                }))
              }
              placeholder={String(profile.calculatedTargetCalories)}
            />
          </label>
          <div className="stats-grid">
            <div>
              <p className="stat-label">Estimated maintenance</p>
              <p className="stat-value">{profile.maintenanceCalories.toLocaleString()} kcal</p>
            </div>
            <div>
              <p className="stat-label">Calculated target</p>
              <p className="stat-value">{profile.calculatedTargetCalories.toLocaleString()} kcal</p>
            </div>
            <div>
              <p className="stat-label">Current daily target</p>
              <p className="stat-value">
                {(profile.customTargetCalories ?? profile.calculatedTargetCalories).toLocaleString()} kcal
              </p>
            </div>
            <div>
              <p className="stat-label">Current weight</p>
              <p className="stat-value">{formatWeight(currentWeightKg, profile.unitSystem)}</p>
            </div>
          </div>
          {goalError ? <p className="form-message form-message--error">{goalError}</p> : null}
          {profile.targetNotice ? (
            <div className="notice-card notice-card--warning">
              <p>{profile.targetNotice}</p>
            </div>
          ) : null}
          <div className="sheet-actions settings-actions">
            <button type="button" className="button button--ghost" onClick={onRecalculateTarget}>
              Recalculate Target
            </button>
            <button type="button" className="button button--ghost" onClick={onResetCalculatedTarget}>
              Reset to Calculated
            </button>
            <button type="submit" className="button button--primary">
              Save Goal
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="section-label">Appearance</p>
            <h2>Theme</h2>
          </div>
        </div>
        <div className="segmented-control" role="group" aria-label="Theme preference">
          {(['system', 'light', 'dark'] as AppTheme[]).map((theme) => (
            <button
              key={theme}
              type="button"
              className={`segmented-control__button ${settings.theme === theme ? 'segmented-control__button--active' : ''}`}
              onClick={() => onChangeTheme(theme)}
            >
              {theme.charAt(0).toUpperCase() + theme.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="section-label">Data</p>
            <h2>Backup and reset</h2>
          </div>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onImportFile(file);
            }
            event.currentTarget.value = '';
          }}
        />
        <div className="stack stack--tight">
          <button type="button" className="button button--secondary" onClick={onExport}>
            Export Data
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => importInputRef.current?.click()}
          >
            Import Data
          </button>
          <button type="button" className="button button--danger" onClick={onResetData}>
            Reset App
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card__header">
          <div>
            <p className="section-label">About</p>
            <h2>How CalorieTrack works</h2>
          </div>
        </div>
        <div className="stack stack--tight">
          <p className="supporting-copy">
            CalorieTrack stores your calorie history, weight history and settings in local
            browser storage on this device.
          </p>
          <p className="supporting-copy">
            Meal scanning is optional. The frontend never stores an AI provider secret key.
            Use a secure backend endpoint for `VITE_MEAL_SCANNER_API_URL`.
          </p>
        </div>
      </section>
    </div>
  );
}
